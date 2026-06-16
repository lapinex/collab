'use client';

import { pruneUserCacheGlobal } from './messagesRepo';

const GC_INTERVAL_MS = 3 * 60 * 1000;
const MAX_MESSAGES_PER_USER = 50_000;

let activeUserId: string | null = null;
let timer: number | null = null;

async function runGc(userId: string): Promise<void> {
  await pruneUserCacheGlobal(userId, MAX_MESSAGES_PER_USER);
}

export function ensureLocalCacheGcStarted(userId: string): void {
  if (typeof window === 'undefined') return;
  if (activeUserId !== userId) {
    activeUserId = userId;
  }
  if (timer != null) return;
  timer = window.setInterval(() => {
    if (!activeUserId) return;
    void runGc(activeUserId);
  }, GC_INTERVAL_MS);
  void runGc(userId);
}
