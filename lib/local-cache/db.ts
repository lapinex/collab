'use client';

import Dexie, { type Table } from 'dexie';
import type { MessageDTO } from '@/lib/messages/dto';

export interface CachedMessageRow {
  userId: string;
  id: string;
  channelId: string;
  createdAt: number;
  updatedAt: number;
  serverTimestamp: number;
  dto: MessageDTO;
  deletedAt: number | null;
}

export interface ChannelSyncStateRow {
  userId: string;
  channelId: string;
  lastSyncedAt: number;
  lastServerTimestamp: number;
}

class CollabLocalCacheDb extends Dexie {
  messages!: Table<CachedMessageRow, [string, string]>;
  syncState!: Table<ChannelSyncStateRow, [string, string]>;

  constructor() {
    super('collab_local_cache_v1');

    this.version(1).stores({
      messages: [
        '[userId+id]',
        'userId',
        'channelId',
        'createdAt',
        'updatedAt',
        'serverTimestamp',
        '[userId+channelId+createdAt]',
        '[userId+channelId+serverTimestamp]',
      ].join(','),
      syncState: '[userId+channelId], userId, channelId, lastSyncedAt, lastServerTimestamp',
    });
  }
}

let dbInstance: CollabLocalCacheDb | null = null;

export function getLocalCacheDb(): CollabLocalCacheDb | null {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return null;
  }
  if (!dbInstance) {
    dbInstance = new CollabLocalCacheDb();
  }
  return dbInstance;
}
