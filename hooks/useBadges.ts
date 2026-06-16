'use client';

import { useCallback, useRef, useState } from 'react';
import { useBadgeStore } from '@/stores/badge-store';
import { selectSetBadges } from '@/stores/badge.selectors';

export interface BadgeCounts {
  unread: number;
  mentions: number;
}

export interface DMBadgeCounts {
  unread: number;
}

interface BadgesResponse {
  servers: Record<string, BadgeCounts>;
  channels: Record<string, BadgeCounts>;
  dms: Record<string, DMBadgeCounts>;
}

export function useBadges(
  serverIds: string[],
  channelIds: string[],
  dmIds: string[]
) {
  const [isLoading, setIsLoading] = useState(false);
  const fetchRef = useRef<Promise<void> | null>(null);
  const setBadges = useBadgeStore(selectSetBadges);

  const fetchBadges = useCallback(async () => {
    const allIds = serverIds.length + channelIds.length + dmIds.length;
    if (allIds === 0) {
      setBadges({ servers: {}, channels: {}, dms: {} });
      return;
    }
    const params = new URLSearchParams();
    if (serverIds.length) params.set('serverIds', serverIds.join(','));
    if (channelIds.length) params.set('channelIds', channelIds.join(','));
    if (dmIds.length) params.set('dmIds', dmIds.join(','));
    const url = `/api/notifications/badges?${params.toString()}`;
    const p = fetch(url, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as BadgesResponse;
        setBadges({
          servers: data.servers ?? {},
          channels: data.channels ?? {},
          dms: data.dms ?? {},
        });
      })
      .finally(() => {
        if (fetchRef.current === p) fetchRef.current = null;
        setIsLoading(false);
      });
    fetchRef.current = p;
    setIsLoading(true);
    await p;
  }, [serverIds.join(','), channelIds.join(','), dmIds.join(','), setBadges]);

  return {
    fetchBadges,
    isLoading,
  };
}
