'use client';

import { useQuery } from '@tanstack/react-query';
import { svMetaKey } from '@/lib/query-keys/serverViewKeys';
import type { Server, Role, ServerSticker } from '@/types/server';
import type { PermissionFlags } from '@/types/permissions';

export interface ServerMetaSlice {
  server: Server | null;
  roles: Role[];
  stickers: ServerSticker[];
  currentUserPermissions?: PermissionFlags;
}

export function useServerMeta(serverId: string | null) {
  const slice = useQuery<ServerMetaSlice>({
    queryKey: svMetaKey(serverId ?? ''),
    queryFn: async () => ({ server: null, roles: [], stickers: [] }),
    enabled: false,
  });
  return {
    data: slice.data,
    isLoading: !!serverId && slice.data === undefined,
  };
}
