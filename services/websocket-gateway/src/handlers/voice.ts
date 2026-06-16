import type { Connection } from '../types.js';
import { sendMessage, sendError } from '../connection.js';
import { getConnectionManager } from '../router.js';
import { safePublish } from '@collab/lib/redis/pubsub';
import { channels as dbChannels, voiceSessions } from '@collab/lib/db/schema';
import { eq, and, isNull, desc, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '@collab/lib/db/schema';
import { checkLocalRateLimit, makeRateLimitKey } from '../rate-limit.js';
import { checkMVPPermissionNoCache } from '../permissions.js';

// Lazy initialization: database connection is created only when needed
let client: ReturnType<typeof postgres> | null = null;
let db: PostgresJsDatabase<typeof schema> | null = null;

/**
 * Get database instance with lazy initialization
 * Errors are thrown only when database is actually used, not at import time
 */
function getDb(): PostgresJsDatabase<typeof schema> | null {
  if (db) {
    return db;
  }

  // Read DATABASE_URL only when database is actually needed
  const DATABASE_URL = process.env.DATABASE_URL;
  
  if (!DATABASE_URL) {
    // Don't throw here - let handlers gracefully handle missing database
    return null;
  }

  try {
    // Создаем клиент postgres с настройками для Supabase
    client = postgres(DATABASE_URL, {
      max: 10, // Максимальное количество соединений в пуле
      idle_timeout: 20, // Таймаут простоя соединения (секунды)
      connect_timeout: 10, // Таймаут подключения (секунды)
      prepare: false, // Для Supabase pooler
    });

    db = drizzle(client, { schema });
    return db;
  } catch (error) {
    const errorDetails = {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : 'Error',
      timestamp: new Date().toISOString(),
    };
    console.error('Failed to initialize database in WebSocket voice handler:', errorDetails);
    // Do not crash the gateway on missing/invalid DATABASE_URL.
    // Handlers will gracefully error with "Database not initialized".
    return null;
  }
}

// ConnectionManager will be retrieved from router

export async function handleVoiceJoin(
  connection: Connection,
  payload: unknown,
  requestId?: string
): Promise<void> {
  const db = getDb();
  if (!db) {
    sendError(connection.ws, 'Database not initialized', requestId);
    return;
  }
  
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('channelId' in payload)
  ) {
    sendError(connection.ws, 'Invalid payload', requestId);
    return;
  }

  const { channelId } = payload as { channelId: string };

  // Rate limiting: 5 voice joins per minute
  const rateLimitKey = makeRateLimitKey(connection.userId, 'voice:join');
  const rateLimitResult = checkLocalRateLimit({
    key: rateLimitKey,
    limit: 5,
    windowSeconds: 60,
  });

  if (!rateLimitResult.allowed) {
    sendError(connection.ws, 'Rate limit exceeded. Maximum 5 voice joins per minute.', requestId);
    return;
  }

  // Validate permissions and channel type
  const channel = await db.query.channels.findFirst({
    where: eq(dbChannels.id, channelId),
  });

  if (!channel) {
    sendError(connection.ws, 'Channel not found', requestId);
    return;
  }

  if (channel.type !== 'voice') {
    sendError(connection.ws, 'Channel is not a voice channel', requestId);
    return;
  }

  const canConnect = await checkMVPPermissionNoCache(
    db,
    connection.userId,
    channel.serverId,
    'canConnectVoice'
  );

  if (!canConnect) {
    sendError(connection.ws, 'Insufficient permissions', requestId);
    return;
  }

  // Guard: Check if user already has an active voice session
  const existingSession = await db!.query.voiceSessions.findFirst({
    where: and(
      eq(voiceSessions.userId, connection.userId),
      isNull(voiceSessions.leftAt)
    ),
    orderBy: [desc(voiceSessions.joinedAt)],
  });

  if (existingSession) {
    // If already in a different channel, return error
    if (existingSession.channelId !== channelId) {
      sendError(connection.ws, 'Already connected to another voice channel', requestId);
      return;
    }
    // If already in this channel, return success (idempotent)
    const voicePayload = {
      channelId,
      userId: connection.userId,
      joinedAt: existingSession.joinedAt.toISOString(),
    };
    sendMessage(connection.ws, 'voice:joined', voicePayload, requestId);
    return;
  }

  let joinedAt: Date;
  try {
    const result = await db.transaction(async (tx) => {
      await tx
        .update(voiceSessions)
        .set({ leftAt: sql`now()` })
        .where(and(eq(voiceSessions.userId, connection.userId), isNull(voiceSessions.leftAt)));
      const rows = await tx
        .insert(voiceSessions)
        .values({ userId: connection.userId, channelId })
        .returning({ joinedAt: voiceSessions.joinedAt });
      return rows[0];
    });
    joinedAt = result?.joinedAt ?? new Date();
  } catch (err) {
    console.error('[voice] handleVoiceJoin: failed to write voice_sessions', err);
    sendError(connection.ws, 'Failed to join voice channel', requestId);
    return;
  }

  const voicePayload = {
    channelId,
    userId: connection.userId,
    joinedAt: joinedAt.toISOString(),
  };

  // Get shared connection manager and broadcast to channel subscribers
  const connectionManager = getConnectionManager();
  connectionManager.broadcastToChannel(
    channelId,
    'voice:joined',
    voicePayload,
    connection.ws
  );

  // Publish to Redis
  await safePublish(`voice:${channelId}`, JSON.stringify(voicePayload));

  sendMessage(connection.ws, 'voice:joined', voicePayload, requestId);
}

export async function handleVoiceLeave(
  connection: Connection,
  payload: unknown,
  requestId?: string
): Promise<void> {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('channelId' in payload)
  ) {
    sendError(connection.ws, 'Invalid payload', requestId);
    return;
  }

  const { channelId } = payload as { channelId: string };

  const dbForLeave = getDb();
  let leftAt: Date = new Date();
  if (dbForLeave) {
    try {
      const updated = await dbForLeave
        .update(voiceSessions)
        .set({ leftAt: sql`now()` })
        .where(
          and(
            eq(voiceSessions.userId, connection.userId),
            eq(voiceSessions.channelId, channelId),
            isNull(voiceSessions.leftAt)
          )
        )
        .returning({ leftAt: voiceSessions.leftAt });
      if (updated[0]?.leftAt) leftAt = updated[0].leftAt;
    } catch (err) {
      console.error('[voice] handleVoiceLeave: failed to update voice_sessions', err);
    }
  }

  const voicePayload = {
    channelId,
    userId: connection.userId,
    leftAt: leftAt.toISOString(),
  };

  // Get shared connection manager and broadcast to channel subscribers
  const connectionManager = getConnectionManager();
  connectionManager.broadcastToChannel(
    channelId,
    'voice:left',
    voicePayload,
    connection.ws
  );

  // Publish to Redis
  await safePublish(`voice:${channelId}`, JSON.stringify(voicePayload));

  sendMessage(connection.ws, 'voice:left', voicePayload, requestId);
}

/**
 * Close all active voice sessions for a user (e.g. on WebSocket disconnect).
 * Call from ws.on('close') to avoid ghost sessions in voice_sessions.
 */
export async function closeAllVoiceSessionsForUser(userId: string): Promise<void> {
  const dbInstance = getDb();
  if (!dbInstance) return;
  try {
    await dbInstance
      .update(voiceSessions)
      .set({ leftAt: sql`now()` })
      .where(and(eq(voiceSessions.userId, userId), isNull(voiceSessions.leftAt)));
  } catch (err) {
    console.error('[voice] closeAllVoiceSessionsForUser failed', err);
  }
}
