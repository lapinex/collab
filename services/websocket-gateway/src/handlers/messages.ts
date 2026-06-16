import type { Connection } from '../types.js';
import { MESSAGE_MAX_LENGTH } from '../constants.js';
import { sendMessage, sendInternalError, sendPermissionError, sendRateLimitError } from '../connection.js';
import { getConnectionManager } from '../router.js';
import { messages, channels, users } from '@collab/lib/db/schema';
import { eq } from 'drizzle-orm';
import { safePublish } from '@collab/lib/redis/pubsub';
import { checkLocalRateLimit, makeRateLimitKey } from '../rate-limit.js';
import { checkMVPPermissionNoCache } from '../permissions.js';
import { getDb } from '../db.js';
import { LruTtlMap } from '../idempotency.js';

type CommittedMessage = {
  messagePayload: Record<string, unknown>;
  messageId: string;
};

// Lazy initialization: nonceCache is created only when needed
let nonceCache: LruTtlMap<CommittedMessage> | null = null;

/**
 * Get nonce cache with lazy initialization
 * Environment variables are read only when cache is actually needed
 */
function getNonceCache(): LruTtlMap<CommittedMessage> {
  if (nonceCache) {
    return nonceCache;
  }

  // Read environment variables only when cache is actually needed
  const NONCE_TTL_MS = parseInt(process.env.WS_NONCE_TTL_MS || '60000', 10);
  const NONCE_MAX = parseInt(process.env.WS_NONCE_MAX_ENTRIES || '10000', 10);
  
  nonceCache = new LruTtlMap<CommittedMessage>({
    ttlMs: Number.isFinite(NONCE_TTL_MS) ? NONCE_TTL_MS : 60000,
    maxEntries: Number.isFinite(NONCE_MAX) ? NONCE_MAX : 10000,
  });
  
  return nonceCache;
}

// ConnectionManager will be retrieved from router

export async function handleMessageCreate(
  connection: Connection,
  payload: Record<string, unknown>,
  requestId: string | undefined,
  nonce: string | undefined
): Promise<void> {
  const traceId = requestId || `trace_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const startedAt = Date.now();

  if (!nonce || typeof nonce !== 'string' || nonce.length < 8 || nonce.length > 256) {
    sendInternalError(connection.ws, { code: 'BAD_PAYLOAD', message: 'nonce is required' }, requestId);
    return;
  }

  const channelId = typeof payload.channelId === 'string' ? payload.channelId : null;
  const content = typeof payload.content === 'string' ? payload.content : null;

  console.log(
    JSON.stringify({
      event: 'message:create.received',
      traceId,
      userId: connection.userId,
      channelId,
      nonce,
      contentLength: content?.length,
    })
  );

  if (!channelId || !content) {
    sendInternalError(connection.ws, { code: 'BAD_PAYLOAD', message: 'channelId and content required' }, requestId, nonce);
    return;
  }

  if (content.length === 0 || content.length > MESSAGE_MAX_LENGTH) {
    sendInternalError(connection.ws, { code: 'BAD_PAYLOAD', message: 'content length invalid' }, requestId, nonce);
    return;
  }

  try {
    const idempotencyKey = `${connection.userId}:${channelId}:${nonce}`;
    const cache = getNonceCache();
    const existing = cache.get(idempotencyKey);

    if (existing?.state === 'pending') {
      sendRateLimitError(
        connection.ws,
        { code: 'IN_FLIGHT', message: 'Duplicate in-flight request', retryAfterMs: 250 },
        requestId,
        nonce
      );
      return;
    }

    if (existing?.state === 'committed' && existing.value) {
      // Re-emit (same messageId) – do NOT republish
      sendMessage(connection.ws, 'message:created', existing.value.messagePayload, requestId, nonce);
      console.log(
        JSON.stringify({
          event: 'message:create.idempotent_reemit',
          traceId,
          userId: connection.userId,
          channelId,
          nonce,
          messageId: existing.value.messageId,
          outcome: 'duplicate',
        })
      );
      return;
    }

    cache.setPending(idempotencyKey);

    // Rate limiting: 10 messages per minute
    const rateLimitKey = makeRateLimitKey(connection.userId, 'message:create');
    const rateLimitResult = checkLocalRateLimit({
      key: rateLimitKey,
      limit: 10,
      windowSeconds: 60,
    });

    if (!rateLimitResult.allowed) {
      sendRateLimitError(
        connection.ws,
        { code: 'RATE_LIMITED', message: 'Rate limit exceeded', retryAfterMs: Math.max(0, rateLimitResult.resetAtMs - Date.now()) },
        requestId,
        nonce
      );
      return;
    }

    const db = getDb();

    // Validate permissions - check if user can send messages in this channel
    const channel = await db.query.channels.findFirst({
      where: eq(channels.id, channelId),
    });

    if (!channel) {
      sendPermissionError(connection.ws, { code: 'PERMISSION_DENIED', message: 'Channel not found' }, requestId, nonce);
      return;
    }

    const canSend = await checkMVPPermissionNoCache(
      db,
      connection.userId,
      channel.serverId,
      'canSendMessages'
    );

    if (!canSend) {
      sendPermissionError(connection.ws, { code: 'PERMISSION_DENIED', message: 'Insufficient permissions' }, requestId, nonce);
      return;
    }

    // Create message in database
    const dbInsertStart = Date.now();
    const [message] = await db
      .insert(messages)
      .values({
        channelId,
        userId: connection.userId,
        content,
      })
      .returning({
        id: messages.id,
        channelId: messages.channelId,
        userId: messages.userId,
        content: messages.content,
        editedAt: messages.editedAt,
        deletedAt: messages.deletedAt,
        createdAt: messages.createdAt,
        updatedAt: messages.updatedAt,
      });

    console.log(
      JSON.stringify({
        event: message ? 'message:create.db_insert.ok' : 'message:create.db_insert.fail',
        traceId,
        userId: connection.userId,
        channelId,
        nonce,
        messageId: message?.id,
        latencyMs: Date.now() - dbInsertStart,
        outcome: message ? 'ok' : 'fail',
      })
    );

    if (!message) {
      sendInternalError(connection.ws, { code: 'DB_WRITE_FAILED', message: 'Failed to create message' }, requestId, nonce);
      return;
    }

    // Load full user information
    const user = await db.query.users.findFirst({
      where: eq(users.id, connection.userId),
      columns: {
        id: true,
        name: true,
        avatarUrl: true,
      },
    });

    if (!user) {
      sendInternalError(connection.ws, { code: 'DB_WRITE_FAILED', message: 'User not found' }, requestId, nonce);
      return;
    }

    // NOTE: Gateway must not manage cache. DB is source of truth.

    const messagePayload: Record<string, unknown> = {
      messageId: message.id,
      channelId: message.channelId,
      userId: message.userId,
      content: message.content,
      editedAt: message.editedAt ? message.editedAt.toISOString() : null,
      deletedAt: message.deletedAt ? message.deletedAt.toISOString() : null,
      createdAt: message.createdAt.toISOString(),
      updatedAt: message.updatedAt.toISOString(),
      nonce,
      user: {
        id: user.id,
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
      reactions: [],
    };

    // Broadcast to local channel subscribers
    const connectionManager = getConnectionManager();
    const subscribers = connectionManager.getChannelSubscribers(channelId);
    const fanoutCount = subscribers.filter((c: Connection) => c.ws !== connection.ws).length;
    connectionManager.broadcastToChannel(channelId, 'message:created', messagePayload, connection.ws);

    // Publish to Redis BEFORE ACK — so ACK can reflect delivery status
    const redisStart = Date.now();
    const published = await safePublish(`messages:${channelId}`, JSON.stringify(messagePayload));
    const redisLatencyMs = Date.now() - redisStart;

    console.log(
      JSON.stringify({
        event: published ? 'message:create.redis_publish.ok' : 'message:create.redis_publish.fail',
        traceId,
        userId: connection.userId,
        channelId,
        nonce,
        messageId: message.id,
        latencyMs: redisLatencyMs,
        outcome: published ? 'ok' : 'fail',
      })
    );

    if (!published) {
      console.warn(
        JSON.stringify({
          event: 'message:create.redis_publish.failed',
          traceId,
          userId: connection.userId,
          channelId,
          nonce,
          messageId: message.id,
          outcome: 'REDIS_PUBLISH_FAILED',
        })
      );
    }

    // ACK sender with delivery status; _publishFailed signals cross-instance delivery may have failed
    const ackPayload: Record<string, unknown> = published
      ? messagePayload
      : { ...messagePayload, _publishFailed: true };
    sendMessage(connection.ws, 'message:created', ackPayload, requestId, nonce);

    cache.commit(idempotencyKey, { messageId: String(message.id), messagePayload });

    console.log(
      JSON.stringify({
        event: 'fanout.message.created',
        traceId,
        userId: connection.userId,
        channelId,
        nonce,
        messageId: message.id,
        fanoutCount,
        redisPublished: published,
        outcome: 'ok',
      })
    );

    console.log(
      JSON.stringify({
        event: 'message:create.complete',
        traceId,
        userId: connection.userId,
        channelId,
        nonce,
        messageId: message.id,
        latencyMs: Date.now() - startedAt,
        outcome: 'ok',
      })
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'message:create.exception',
        traceId,
        userId: connection.userId,
        channelId,
        nonce,
        outcome: 'fail',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    );
    sendInternalError(
      connection.ws,
      { code: 'DB_WRITE_FAILED', message: error instanceof Error ? error.message : 'DB write failed' },
      requestId,
      nonce
    );
  }
}
