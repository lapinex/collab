'use client';

import Dexie from 'dexie';
import type { MessageDTO } from '@/lib/messages/dto';
import { getLocalCacheDb, type CachedMessageRow } from './db';

const DEFAULT_PRUNE_LIMIT = 5000;
const DEFAULT_SYNC_FRESHNESS_MS = 15_000;

function toTimestamp(isoLike: string | null | undefined): number {
  if (!isoLike) return Date.now();
  const ts = Date.parse(isoLike);
  return Number.isFinite(ts) ? ts : Date.now();
}

function toRow(userId: string, channelId: string, dto: MessageDTO): CachedMessageRow {
  const createdAt = toTimestamp(dto.createdAt);
  const updatedAt = dto.editedAt ? toTimestamp(dto.editedAt) : createdAt;
  return {
    userId,
    id: dto.id,
    channelId,
    createdAt,
    updatedAt,
    serverTimestamp: createdAt,
    dto,
    deletedAt: null,
  };
}

export async function upsertMessagesCache(
  userId: string,
  channelId: string,
  messages: MessageDTO[]
): Promise<void> {
  const db = getLocalCacheDb();
  if (!db || messages.length === 0) return;
  const rows = messages.map((m) => toRow(userId, channelId, m));
  await db.messages.bulkPut(rows);
}

export async function getCachedMessages(
  userId: string,
  channelId: string,
  limit = 50
): Promise<MessageDTO[]> {
  const db = getLocalCacheDb();
  if (!db) return [];
  const rows = await db.messages
    .where('[userId+channelId+serverTimestamp]')
    .between([userId, channelId, Dexie.minKey], [userId, channelId, Dexie.maxKey])
    .reverse()
    .limit(limit)
    .toArray();
  return rows.reverse().map((r) => r.dto);
}

export async function removeCachedMessage(
  userId: string,
  messageId: string
): Promise<void> {
  const db = getLocalCacheDb();
  if (!db) return;
  await db.messages.delete([userId, messageId]);
}

export async function markChannelSynced(
  userId: string,
  channelId: string,
  lastServerTimestamp: number
): Promise<void> {
  const db = getLocalCacheDb();
  if (!db) return;
  await db.syncState.put({
    userId,
    channelId,
    lastSyncedAt: Date.now(),
    lastServerTimestamp,
  });
}

export async function getChannelSyncState(
  userId: string,
  channelId: string
): Promise<{ lastSyncedAt: number; lastServerTimestamp: number } | null> {
  const db = getLocalCacheDb();
  if (!db) return null;
  const state = await db.syncState.get([userId, channelId]);
  if (!state) return null;
  return {
    lastSyncedAt: state.lastSyncedAt,
    lastServerTimestamp: state.lastServerTimestamp,
  };
}

export async function shouldSyncChannel(
  userId: string,
  channelId: string,
  freshnessMs = DEFAULT_SYNC_FRESHNESS_MS
): Promise<boolean> {
  const db = getLocalCacheDb();
  if (!db) return true;
  const state = await db.syncState.get([userId, channelId]);
  if (!state) return true;
  return Date.now() - state.lastSyncedAt > freshnessMs;
}

export async function pruneChannelCache(
  userId: string,
  channelId: string,
  maxMessages = DEFAULT_PRUNE_LIMIT
): Promise<void> {
  const db = getLocalCacheDb();
  if (!db) return;

  const idsToDelete = await db.messages
    .where('[userId+channelId+serverTimestamp]')
    .between([userId, channelId, Dexie.minKey], [userId, channelId, Dexie.maxKey])
    .reverse()
    .offset(maxMessages)
    .toArray();

  if (idsToDelete.length === 0) return;
  await db.messages.bulkDelete(idsToDelete.map((r) => [r.userId, r.id]));
}

export async function clearUserCache(userId: string): Promise<void> {
  const db = getLocalCacheDb();
  if (!db) return;
  await db.transaction('rw', db.messages, db.syncState, async () => {
    const messages = await db.messages.where('userId').equals(userId).toArray();
    await db.messages.bulkDelete(messages.map((m) => [m.userId, m.id]));
    const syncRows = await db.syncState.where('userId').equals(userId).toArray();
    await db.syncState.bulkDelete(syncRows.map((s) => [s.userId, s.channelId]));
  });
}

export async function pruneUserCacheGlobal(
  userId: string,
  maxMessages = 50_000
): Promise<void> {
  const db = getLocalCacheDb();
  if (!db) return;
  const rows = await db.messages
    .where('userId')
    .equals(userId)
    .sortBy('serverTimestamp');
  if (rows.length <= maxMessages) return;
  const toDelete = rows.slice(0, rows.length - maxMessages);
  await db.messages.bulkDelete(toDelete.map((r) => [r.userId, r.id]));
}

