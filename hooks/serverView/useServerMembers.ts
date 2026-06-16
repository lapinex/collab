'use client';

import { useQuery } from '@tanstack/react-query';
import { svMembersKey } from '@/lib/query-keys/serverViewKeys';
import type { ServerViewMember } from '@/hooks/useServerViewQuery';

export function useServerMembers(serverId: string | null) {
  const slice = useQuery<ServerViewMember[]>({
    queryKey: svMembersKey(serverId ?? ''),
    queryFn: async () => [],
    enabled: false,
  });
  return {
    data: slice.data,
    isLoading: !!serverId && slice.data === undefined,
  };
}
