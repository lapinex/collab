import type { Connection } from '../types.js';
import { safePublish } from '@collab/lib/redis/pubsub';

const THROTTLE_MS = 3000;
const AUTO_STOP_MS = 10000;
const ACTIVITY_TYPES = new Set([
  'typing',
  'uploading:image',
  'uploading:video',
  'uploading:file',
]);

interface ThrottleState {
  userId: string;
  channelId: string;
  activityType: string;
  lastSentAt: number;
  autoStopTimeout?: ReturnType<typeof setTimeout>;
}

const throttleMap = new Map<string, ThrottleState>();

interface ActivityPayload {
  action: 'start' | 'stop';
  channelId: string;
  activityType: string;
}

function publishActivity(channelId: string, event: 'activity:start' | 'activity:stop', payload: Record<string, unknown>): void {
  const message = JSON.stringify({ event: 'activity', payload });
  safePublish(`realtime:channel:${channelId}`, message).catch(() => {});
}

export async function handleActivity(connection: Connection, payload: unknown): Promise<void> {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('channelId' in payload) ||
    !('action' in payload) ||
    !('activityType' in payload)
  ) {
    return;
  }

  const { action, channelId, activityType } = payload as ActivityPayload;
  if (typeof channelId !== 'string' || typeof action !== 'string' || typeof activityType !== 'string') {
    return;
  }
  if (action !== 'start' && action !== 'stop') return;
  if (!ACTIVITY_TYPES.has(activityType)) return;

  const userId = connection.userId;
  const userName = connection.name?.trim() ? connection.name : 'User';
  const key = `${userId}:${channelId}`;
  const now = Date.now();

  if (action === 'start') {
    const existing = throttleMap.get(key);
    if (existing) {
      if (now - existing.lastSentAt < THROTTLE_MS) {
        if (existing.autoStopTimeout) clearTimeout(existing.autoStopTimeout);
        existing.autoStopTimeout = setTimeout(() => {
          handleActivity(connection, { action: 'stop', channelId, activityType });
        }, AUTO_STOP_MS);
        return;
      }
      if (existing.autoStopTimeout) clearTimeout(existing.autoStopTimeout);
    }

    const eventPayload = {
      event: 'activity:start' as const,
      userId,
      userName,
      channelId,
      activityType,
      timestamp: new Date().toISOString(),
    };
    publishActivity(channelId, 'activity:start', eventPayload);

    const autoStopTimeout = setTimeout(() => {
      throttleMap.delete(key);
      handleActivity(connection, { action: 'stop', channelId, activityType });
    }, AUTO_STOP_MS);

    throttleMap.set(key, {
      userId,
      channelId,
      activityType,
      lastSentAt: now,
      autoStopTimeout,
    });
    return;
  }

  const existing = throttleMap.get(key);
  if (existing?.autoStopTimeout) {
    clearTimeout(existing.autoStopTimeout);
  }
  throttleMap.delete(key);

  const eventPayload = {
    event: 'activity:stop' as const,
    userId,
    userName,
    channelId,
    activityType,
    timestamp: new Date().toISOString(),
  };
  publishActivity(channelId, 'activity:stop', eventPayload);
}
