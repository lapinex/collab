'use client';

import { useServerMeta } from '@/hooks/serverView/useServerMeta';
import type { PermissionFlags } from '@/types/permissions';

const DEFAULT_FLAGS: PermissionFlags = {
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

/**
 * Server-level permission flags for current user.
 * Reads from meta slice (currentUserPermissions); no separate permissions/check call.
 */
export function useServerPermissions(serverId: string | null) {
  const { data } = useServerMeta(serverId);
  const permissions = (data?.currentUserPermissions
    ? { ...DEFAULT_FLAGS, ...data.currentUserPermissions }
    : DEFAULT_FLAGS) as PermissionFlags;
  return {
    permissions,
    isLoading: !!serverId && data === undefined,
  };
}
