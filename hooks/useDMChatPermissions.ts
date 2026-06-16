'use client';

/**
 * DM chat permissions. No roles: user can send, react, edit/delete own messages only.
 */
export interface DMChatPermissions {
  canViewChannel: true;
  canSendMessages: true;
  canAttachFiles: true;
  canAddReactions: true;
  canManageMessages: false;
  canManageRoles: false;
  canKickMembers: false;
  canBanMembers: false;
  canManageChannels: false;
  canManageMembers: false;
  canCreateInvites: false;
  canManageInvites: false;
  canViewAuditLog: false;
  canMentionEveryone: false;
}

const DM_PERMISSIONS: DMChatPermissions = {
  canViewChannel: true,
  canSendMessages: true,
  canAttachFiles: true,
  canAddReactions: true,
  canManageMessages: false,
  canManageRoles: false,
  canKickMembers: false,
  canBanMembers: false,
  canManageChannels: false,
  canManageMembers: false,
  canCreateInvites: false,
  canManageInvites: false,
  canViewAuditLog: false,
  canMentionEveryone: false,
};

export function useDMChatPermissions(_channelId: string | null): {
  permissions: DMChatPermissions;
  isLoading: false;
} {
  return {
    permissions: DM_PERMISSIONS,
    isLoading: false,
  };
}
