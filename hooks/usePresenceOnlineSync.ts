'use client';

import { useEffect, useRef } from 'react';
import { usePresenceStore } from '@/stores/presence-store';
import { selectReconcileOnlineUserIds } from '@/stores/presence.selectors';
import { useAuth } from '@/hooks/useAuth';

/** Reconciliation fallback: less frequent than realtime. Realtime is primary. */
const PRESENCE_ONLINE_POLL_MS = 60_000;

async function fetchOnlineUserIds(serverId?: string | null): Promise<string[]> {
  const url = serverId ? `/api/presence/online?serverId=${encodeURIComponent(serverId)}` : '/api/presence/online';
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.onlineUserIds) ? data.onlineUserIds : Array.isArray(data.online) ? data.online : [];
}

/**
 * Presence reconciliation fallback — polls /api/presence/online when realtime is stale.
 * Realtime (USER_PRESENCE_UPDATE, presence:update) is primary; polling only applies when
 * no recent realtime update (avoids overwriting fresh data with stale polling).
 */
export function usePresenceOnlineSync(serverId?: string | null) {
  const { isAuthenticated } = useAuth();
  const reconcileOnlineUserIds = usePresenceStore(selectReconcileOnlineUserIds);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    const sync = async () => {
      const ids = await fetchOnlineUserIds(serverId);
      reconcileOnlineUserIds(ids);
    };

    void sync();
    pollRef.current = setInterval(sync, PRESENCE_ONLINE_POLL_MS);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isAuthenticated, reconcileOnlineUserIds, serverId]);
}
