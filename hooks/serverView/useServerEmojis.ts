'use client';

import { useQuery } from '@tanstack/react-query';
import { svEmojisKey } from '@/lib/query-keys/serverViewKeys';
import type { ServerEmoji } from '@/types/server';

export function useServerEmojis(serverId: string | null) {
  const slice = useQuery<ServerEmoji[]>({
    queryKey: svEmojisKey(serverId ?? ''),
    queryFn: async () => [],
    enabled: false,
  });
  return {
    data: slice.data,
    isLoading: !!serverId && slice.data === undefined,
  };
}
