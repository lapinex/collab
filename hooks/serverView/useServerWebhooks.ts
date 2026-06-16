'use client';

import { useQuery } from '@tanstack/react-query';
import { svWebhooksKey } from '@/lib/query-keys/serverViewKeys';
import type { Webhook } from '@/types/server';

export function useServerWebhooks(serverId: string | null) {
  const slice = useQuery<Webhook[]>({
    queryKey: svWebhooksKey(serverId ?? ''),
    queryFn: async () => [],
    enabled: false,
  });
  return {
    data: slice.data,
    isLoading: !!serverId && slice.data === undefined,
  };
}
