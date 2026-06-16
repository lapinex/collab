'use client';

import { useQuery } from '@tanstack/react-query';
import type { Channel } from '@/types/server';
import type { PermissionFlags } from '@/types/permissions';

export interface ChannelPermissionOverwrite {
  id: string;
  channelId: string;
  roleId: string | null;
  userId: string | null;
  allow: number;
  deny: number;
  role?: { id: string; name: string; color: string; position: number } | null;
  user?: { id: string; name: string; avatarUrl: string | null } | null;
}

export interface ChannelViewData {
  channel: Channel | null;
  overwrites: ChannelPermissionOverwrite[];
  currentUserPermissions?: PermissionFlags;
}

export function channelViewQueryKey(channelId: string | null) {
  return ['channelView', channelId] as const;
}

interface ChannelViewApiResponse {
  channel: Channel;
  permissionOverwrites: ChannelPermissionOverwrite[];
  currentUserPermissions: PermissionFlags;
}

async function fetchChannelView(channelId: string): Promise<ChannelViewData> {
  const res = await fetch(`/api/channels/${channelId}/view`, {
    credentials: 'include',
  });
  const data = (await res.json().catch(() => ({}))) as ChannelViewApiResponse;
  if (!res.ok) {
    const msg = (data as { error?: string }).error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return {
    channel: data.channel ?? null,
    overwrites: data.permissionOverwrites ?? [],
    currentUserPermissions: data.currentUserPermissions,
  };
}

/**
 * Channel "view" query: single GET /api/channels/[channelId]/view.
 * Returns channel, permission overwrites, currentUserPermissions.
 */
export function useChannelViewQuery(channelId: string | null): {
  channel: Channel | null;
  overwrites: ChannelPermissionOverwrite[];
  currentUserPermissions?: PermissionFlags;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const query = useQuery({
    queryKey: channelViewQueryKey(channelId),
    queryFn: () => fetchChannelView(channelId!),
    enabled: !!channelId,
  });

  return {
    channel: query.data?.channel ?? null,
    overwrites: query.data?.overwrites ?? [],
    currentUserPermissions: query.data?.currentUserPermissions,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}
