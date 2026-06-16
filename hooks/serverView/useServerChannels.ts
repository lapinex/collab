'use client';

import { useQuery } from '@tanstack/react-query';
import { svChannelsKey } from '@/lib/query-keys/serverViewKeys';
import type { Channel } from '@/types/server';

export function useServerChannels(serverId: string | null) {
  const slice = useQuery<Channel[]>({
    queryKey: svChannelsKey(serverId ?? ''),
    queryFn: async () => [],
    enabled: false,
  });
  return {
    data: slice.data,
    isLoading: !!serverId && slice.data === undefined,
  };
}
