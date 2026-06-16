'use client';

import { clearUserCache } from './messagesRepo';

const ACTIVE_USER_STORAGE_KEY = 'collab.cache.activeUserId';

/**
 * Keeps local cache user-scoped and prevents cross-account leakage.
 * We do not clear cache on logout; we clear previous user's cache only on account switch.
 */
export async function syncCacheUserScope(nextUserId: string | null): Promise<void> {
  if (typeof window === 'undefined') return;
  const prevUserId = localStorage.getItem(ACTIVE_USER_STORAGE_KEY);

  if (!nextUserId) {
    return;
  }

  if (prevUserId && prevUserId !== nextUserId) {
    await clearUserCache(prevUserId);
  }

  localStorage.setItem(ACTIVE_USER_STORAGE_KEY, nextUserId);
}
