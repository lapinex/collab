/**
 * Central notification emission: insert into DB + publish realtime.
 * Dedup by (userId, type, dedupKey) within a short window.
 */
import type { SqlClient } from '../routes/types.js';

const DEDUP_WINDOW_MS = 15_000;

export interface EmitNotificationParams {
  userId: string;
  type: string;
  payload: Record<string, unknown> | null;
  messageId?: string | null;
  channelId?: string | null;
  serverId?: string | null;
  dmId?: string | null;
  /** If set, skip creating duplicate for same (userId, type, dedupKey) within DEDUP_WINDOW_MS */
  dedupKey?: string;
  /** If true, do not create when userId === authorId (caller must pass authorId in payload or context) */
  skipIfAuthor?: boolean;
  authorId?: string;
}

export interface EmitNotificationDeps {
  sql: SqlClient;
  redis: { get: (key: string) => Promise<string | null>; setex: (key: string, ttl: number, value: string) => Promise<unknown> };
  publishRealtime: (topic: string, event: string, payload: unknown) => Promise<void>;
}

export async function emitNotification(
  deps: EmitNotificationDeps,
  params: EmitNotificationParams
): Promise<{ id: string } | null> {
  const { userId, type, payload, messageId, channelId, serverId, dmId, dedupKey, skipIfAuthor, authorId } = params;
  if (skipIfAuthor && authorId && userId === authorId) return null;

  if (dedupKey) {
    const key = `notif:dedup:${userId}:${type}:${dedupKey}`;
    const existing = await deps.redis.get(key);
    if (existing) return null;
    await deps.redis.setex(key, Math.ceil(DEDUP_WINDOW_MS / 1000), '1');
  }

  const payloadJson = payload ? JSON.stringify(payload) : null;
  const rows = await deps.sql<{
    id: string;
    type: string;
    message_id: string | null;
    channel_id: string | null;
    server_id: string | null;
    dm_id: string | null;
    read_at: null;
    created_at: Date;
  }[]>`
    insert into notifications (user_id, type, message_id, channel_id, server_id, dm_id, payload, read_at, created_at)
    values (
      ${userId},
      ${type},
      ${messageId ?? null},
      ${channelId ?? null},
      ${serverId ?? null},
      ${dmId ?? null},
      ${payloadJson},
      null,
      now()
    )
    returning id, type, message_id, channel_id, server_id, dm_id, read_at, created_at
  `;

  const row = rows[0];
  if (!row) return null;

  const dto = {
    id: row.id,
    type: row.type,
    userId,
    messageId: row.message_id,
    channelId: row.channel_id,
    serverId: row.server_id,
    dmId: row.dm_id,
    readAt: null,
    createdAt: row.created_at.toISOString(),
    payload: payload ?? null,
  };

  await deps.publishRealtime(`user:${userId}`, 'notification:new', dto);
  return { id: row.id };
}
