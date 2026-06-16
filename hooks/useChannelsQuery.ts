'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { selectIsAuthenticated } from '@/stores/auth.selectors';
import { apiGet } from '@/lib/api-client';
import type { Channel } from '@/types/server';
import { channelsListQueryKey } from '@/lib/messages/keys';

function queryKey(serverId: string | null) {
  return channelsListQueryKey(serverId);
}

type ChannelsResponse = {
  channels: Channel[];
  hasMore?: boolean;
  nextCursor?: string | null;
  meta?: { filteredOutByPermission?: number };
};

const CHANNELS_LIST_PAGE_SIZE = 50;

async function fetchChannels(serverId: string): Promise<ChannelsResponse> {
  const query = new URLSearchParams({
    limit: String(CHANNELS_LIST_PAGE_SIZE),
  });
  const data = await apiGet<ChannelsResponse>(`/api/servers/${serverId}/channels?${query.toString()}`);
  const n = data.meta?.filteredOutByPermission;
  if (typeof n === 'number' && n > 0 && process.env.NODE_ENV === 'development') {
    console.info('[Channels] Filtered by VIEW_CHANNEL:', n, 'channel(s) hidden due to permissions');
  }
  return data;
}

/**
 * TanStack Query hook for channel list by server.
 * Uses existing GET /api/servers/[serverId]/channels. Parallel to Zustand.
 */
export function useChannelsQuery(serverId: string | null) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const enabled = !!isAuthenticated && !!serverId;

  return useQuery({
    queryKey: queryKey(serverId),
    queryFn: () => fetchChannels(serverId!),
    enabled,
    staleTime: 60_000,
  });
}
