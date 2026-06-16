// MVP: Simplified role system with 3 fixed roles
// This replaces the complex 50+ permission system for MVP

export enum MVPRole {
  ADMIN = 'admin',
  MODERATOR = 'moderator',
  USER = 'user',
}

export const MVP_ROLE_HIERARCHY: Record<MVPRole, number> = {
  [MVPRole.ADMIN]: 3,
  [MVPRole.MODERATOR]: 2,
  [MVPRole.USER]: 1,
};

export interface MVPRolePermissions {
  canManageServer: boolean;
  canManageChannels: boolean;
  canManageMembers: boolean;
  canManageMessages: boolean;
  canKickMembers: boolean;
  canBanMembers: boolean;
  canViewChannel: boolean;
  canSendMessages: boolean;
  canConnectVoice: boolean;
  canSpeakVoice: boolean;
}

export const MVP_ROLE_PERMISSIONS: Record<MVPRole, MVPRolePermissions> = {
  [MVPRole.ADMIN]: {
    canManageServer: true,
    canManageChannels: true,
    canManageMembers: true,
    canManageMessages: true,
    canKickMembers: true,
    canBanMembers: true,
    canViewChannel: true,
    canSendMessages: true,
    canConnectVoice: true,
    canSpeakVoice: true,
  },
  [MVPRole.MODERATOR]: {
    canManageServer: false,
    canManageChannels: false,
    canManageMembers: false,
    canManageMessages: true,
    canKickMembers: true,
    canBanMembers: false,
    canViewChannel: true,
    canSendMessages: true,
    canConnectVoice: true,
    canSpeakVoice: true,
  },
  [MVPRole.USER]: {
    canManageServer: false,
    canManageChannels: false,
    canManageMembers: false,
    canManageMessages: false,
    canKickMembers: false,
    canBanMembers: false,
    canViewChannel: true,
    canSendMessages: true,
    canConnectVoice: true,
    canSpeakVoice: true,
  },
};

export function hasMVPPermission(
  role: MVPRole,
  permission: keyof MVPRolePermissions
): boolean {
  return MVP_ROLE_PERMISSIONS[role][permission];
}

export function canAssignRole(assignerRole: MVPRole, _targetRole: MVPRole): boolean {
  // Only admin can assign roles
  if (assignerRole !== MVPRole.ADMIN) {
    return false;
  }

  // Admin can assign any role
  return true;
}
