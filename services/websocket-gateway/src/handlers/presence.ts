import type { Connection } from '../types.js';
import { sendMessage } from '../connection.js';
import { safePublish } from '@collab/lib/redis/pubsub';
import { getConnectionManager } from '../router.js';

const PRESENCE_REDIS_DEBOUNCE_MS = 2000;

type PresenceFlushState = {
  timerId: ReturnType<typeof setTimeout>;
  userId: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  customStatus: string | null;
};

const presenceRedisDebounce = new Map<string, PresenceFlushState>();

function publishPresenceToRedis(userId: string, status: 'online' | 'idle' | 'dnd' | 'offline', customStatus: string | null): void {
  const presencePayload = {
    userId,
    status,
    customStatus,
    lastSeen: new Date().toISOString(),
  };
  safePublish(`presence:${userId}`, JSON.stringify(presencePayload)).catch(() => {});
}

function clearPresenceDebounce(userId: string): void {
  presenceRedisDebounce.delete(userId);
}

export async function handlePresenceUpdate(
  connection: Connection,
  payload: unknown,
  requestId?: string
): Promise<void> {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('status' in payload)
  ) {
    return;
  }

  const { status, customStatus } = payload as {
    status: 'online' | 'idle' | 'dnd' | 'offline';
    customStatus?: string | null;
  };

  const presencePayload = {
    userId: connection.userId,
    status,
    customStatus: customStatus ?? null,
    lastSeen: new Date().toISOString(),
  };

  // Ack to sender immediately (so client gets response with requestId)
  sendMessage(connection.ws, 'presence:updated', presencePayload, requestId);

  const userId = connection.userId;
  const existing = presenceRedisDebounce.get(userId);

  if (!existing) {
    // Leading: first update in a while → publish to Redis immediately
    publishPresenceToRedis(userId, status, presencePayload.customStatus);
    const timerId = setTimeout(() => clearPresenceDebounce(userId), PRESENCE_REDIS_DEBOUNCE_MS);
    presenceRedisDebounce.set(userId, { timerId, userId, status, customStatus: presencePayload.customStatus });
  } else {
    // Within debounce window → only update pending state; next publish after window clears (on next update)
    clearTimeout(existing.timerId);
    const timerId = setTimeout(() => clearPresenceDebounce(userId), PRESENCE_REDIS_DEBOUNCE_MS);
    presenceRedisDebounce.set(userId, { timerId, userId, status, customStatus: presencePayload.customStatus });
  }
}

/**
 * Handle GET_ONLINE_USERS: return list of userId that have at least one active socket.
 * Client uses this for initial sync so UI doesn't wait for USER_PRESENCE_UPDATE events.
 */
export function handleGetOnlineUsers(
  connection: Connection,
  requestId?: string
): void {
  const manager = getConnectionManager();
  const onlineUserIds = manager.getOnlineUserIds();
  sendMessage(connection.ws, 'ONLINE_USERS', { onlineUserIds }, requestId);
}
