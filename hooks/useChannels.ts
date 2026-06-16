'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useChannelsQuery } from './useChannelsQuery';

export function useChannels(serverId: string | null) {
  const queryClient = useQueryClient();
  const query = useChannelsQuery(serverId);

  const channels = query.data?.channels ?? [];
  const isLoading = query.isLoading;
  const reload = useCallback(() => query.refetch(), [query]);

  const invalidateChannels = useCallback(() => {
    if (serverId) {
      queryClient.invalidateQueries({ queryKey: ['channels', serverId] });
    }
  }, [queryClient, serverId]);

  return {
    channels,
    isLoading,
    reload,
    invalidateChannels,
  };
}
