'use client';

import { useQuery } from '@tanstack/react-query';
import type { PermissionFlags } from '@/types/permissions';

export interface ChannelPermissions extends PermissionFlags {
  [key: string]: boolean;
}

const DEFAULT_PERMISSIONS: ChannelPermissions = {
  canViewServer: false,
  canViewChannel: false,
  canSendMessages: false,
  canAttachFiles: false,
  canAddReactions: false,
  canConnect: false,
  canSpeak: false,
  canManageMessages: false,
  canManageRoles: false,
  canManageChannels: false,
  canManageMembers: false,
  canKickMembers: false,
  canBanMembers: false,
  canCreateInvites: false,
  canManageInvites: false,
  canViewAuditLog: false,
  canMentionEveryone: false,
  canMuteMembers: false,
  canDeafenMembers: false,
};

function channelPermissionsQueryKey(serverId: string | null, channelId: string | null) {
  return ['permissions', 'channel', serverId, channelId] as const;
}

async function fetchChannelPermissions(
  serverId: string,
  channelId: string
): Promise<PermissionFlags> {
  const params = new URLSearchParams({ serverId, channelId });
  const res = await fetch(`/api/permissions/channel?${params}`, { credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  }
  return (data.permissions ?? {}) as PermissionFlags;
}

/**
 * Hook to check channel permissions for current user.
 * Fetches from GET /api/permissions/channel (Redis-cached, 6h TTL); no client-side resolution.
 */
export function useChannelPermissions(
  channelId: string | null,
  serverId: string | null,
  _currentUserId: string | null
) {
  const enabled = !!(channelId && serverId);
  const query = useQuery({
    queryKey: channelPermissionsQueryKey(serverId, channelId),
    queryFn: () => fetchChannelPermissions(serverId!, channelId!),
    enabled,
  });

  const permissions =
    enabled && query.data && !query.error
      ? ({ ...DEFAULT_PERMISSIONS, ...query.data } as ChannelPermissions)
      : DEFAULT_PERMISSIONS;

  return {
    permissions,
    isLoading: enabled && query.isLoading,
  };
}
