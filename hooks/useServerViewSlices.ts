'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchServerView } from './useServerViewQuery';
import {
  svMetaKey,
  svChannelsKey,
  svMembersKey,
  svEmojisKey,
  svWebhooksKey,
} from '@/lib/query-keys/serverViewKeys';

/**
 * Fetches full server view (fetcher only, no parent cache) and syncs to domain slice caches.
 * Call this where serverId is in scope (e.g. app page, settings page).
 * Components then use useServerMeta, useServerChannels, etc.
 */
export function useServerViewSlices(serverId: string | null) {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(!!serverId);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!serverId) {
      setIsLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchServerView(serverId)
      .then((data) => {
        if (cancelled) return;
        queryClient.setQueryData(svMetaKey(serverId), {
          server: data.server,
          roles: data.roles,
          stickers: data.stickers,
          currentUserPermissions: data.currentUserPermissions,
        });
        queryClient.setQueryData(svChannelsKey(serverId), data.channels);
        queryClient.setQueryData(svMembersKey(serverId), data.members);
        queryClient.setQueryData(svEmojisKey(serverId), data.emojis);
        queryClient.setQueryData(svWebhooksKey(serverId), data.webhooks);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serverId, queryClient]);

  return { isLoading, error };
}
