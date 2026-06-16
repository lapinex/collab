import type { Connection } from '../types.js';
import { safePublish } from '@collab/lib/redis/pubsub';
import { getConnectionManager } from '../router.js';
import { checkLocalRateLimit, makeRateLimitKey } from '../rate-limit.js';

const TYPING_START_DEBOUNCE_MS = 250;
const TYPING_STOP_DEBOUNCE_MS = 100;

type TypingFlushState = {
  timerId: ReturnType<typeof setTimeout>;
  connection: Connection;
  channelId: string;
  event: 'start' | 'stop';
  userName?: string;
};

const typingDebounce = new Map<string, TypingFlushState>();

function flushTyping(key: string): void {
  const state = typingDebounce.get(key);
  if (!state) return;
  typingDebounce.delete(key);

  const { connection, channelId, event, userName } = state;
  const connectionManager = getConnectionManager();

  if (event === 'start') {
    const typingPayload = {
      channelId,
      userId: connection.userId,
      userName: userName ?? (connection.name?.trim() ? connection.name : 'Someone'),
    };
    connectionManager.broadcastToChannel(channelId, 'typing:started', typingPayload, connection.ws);
    safePublish(`typing:${channelId}`, JSON.stringify({ type: 'start', ...typingPayload })).catch(() => {});
  } else {
    const typingPayload = { channelId, userId: connection.userId };
    connectionManager.broadcastToChannel(channelId, 'typing:stopped', typingPayload, connection.ws);
    safePublish(`typing:${channelId}`, JSON.stringify({ type: 'stop', ...typingPayload })).catch(() => {});
  }
}

export async function handleTypingStart(
  connection: Connection,
  payload: unknown
): Promise<void> {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('channelId' in payload)
  ) {
    return;
  }

  const { channelId } = payload as { channelId: string };

  const rateLimitKey = makeRateLimitKey(connection.userId, 'typing:start');
  const rateLimitResult = checkLocalRateLimit({
    key: rateLimitKey,
    limit: 30,
    windowSeconds: 60,
  });
  if (!rateLimitResult.allowed) return;

  const key = `${connection.userId}:${channelId}`;
  const existing = typingDebounce.get(key);
  if (existing) clearTimeout(existing.timerId);

  const timerId = setTimeout(() => flushTyping(key), TYPING_START_DEBOUNCE_MS);
  typingDebounce.set(key, {
    timerId,
    connection,
    channelId,
    event: 'start',
    userName: connection.name?.trim() ? connection.name : 'Someone',
  });
}

export async function handleTypingStop(
  connection: Connection,
  payload: unknown
): Promise<void> {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('channelId' in payload)
  ) {
    return;
  }

  const { channelId } = payload as { channelId: string };

  const key = `${connection.userId}:${channelId}`;
  const existing = typingDebounce.get(key);
  if (existing) clearTimeout(existing.timerId);

  const timerId = setTimeout(() => flushTyping(key), TYPING_STOP_DEBOUNCE_MS);
  typingDebounce.set(key, {
    timerId,
    connection,
    channelId,
    event: 'stop',
  });
}
