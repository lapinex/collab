import { Permission, type PermissionFlags } from '@/types/permissions';

// Export all permissions as constants for easy access
export const PERMISSIONS = {
  // Server permissions
  MANAGE_SERVER: Permission.MANAGE_SERVER,
  VIEW_SERVER: Permission.VIEW_SERVER,
  MANAGE_ROLES: Permission.MANAGE_ROLES,
  MANAGE_CHANNELS: Permission.MANAGE_CHANNELS,
  MANAGE_MEMBERS: Permission.MANAGE_MEMBERS,
  KICK_MEMBERS: Permission.KICK_MEMBERS,
  BAN_MEMBERS: Permission.BAN_MEMBERS,
  CREATE_INVITES: Permission.CREATE_INVITES,
  MANAGE_INVITES: Permission.MANAGE_INVITES,
  VIEW_AUDIT_LOG: Permission.VIEW_AUDIT_LOG,

  // Channel permissions
  VIEW_CHANNEL: Permission.VIEW_CHANNEL,
  SEND_MESSAGES: Permission.SEND_MESSAGES,
  SEND_TTS_MESSAGES: Permission.SEND_TTS_MESSAGES,
  MANAGE_MESSAGES: Permission.MANAGE_MESSAGES,
  EMBED_LINKS: Permission.EMBED_LINKS,
  ATTACH_FILES: Permission.ATTACH_FILES,
  READ_MESSAGE_HISTORY: Permission.READ_MESSAGE_HISTORY,
  MENTION_EVERYONE: Permission.MENTION_EVERYONE,
  USE_EXTERNAL_EMOJIS: Permission.USE_EXTERNAL_EMOJIS,
  ADD_REACTIONS: Permission.ADD_REACTIONS,

  // Voice permissions
  CONNECT: Permission.CONNECT,
  SPEAK: Permission.SPEAK,
  MUTE_MEMBERS: Permission.MUTE_MEMBERS,
  DEAFEN_MEMBERS: Permission.DEAFEN_MEMBERS,
  MOVE_MEMBERS: Permission.MOVE_MEMBERS,
  USE_VOICE_ACTIVATION: Permission.USE_VOICE_ACTIVATION,
  PRIORITY_SPEAKER: Permission.PRIORITY_SPEAKER,

  // Advanced permissions
  USE_APPLICATION_COMMANDS: Permission.USE_APPLICATION_COMMANDS,
  MANAGE_EVENTS: Permission.MANAGE_EVENTS,
  MANAGE_WEBHOOKS: Permission.MANAGE_WEBHOOKS,
  USE_EXTERNAL_STICKERS: Permission.USE_EXTERNAL_STICKERS,
  SEND_VOICE_MESSAGES: Permission.SEND_VOICE_MESSAGES,

  // Moderation
  MODERATE_MEMBERS: Permission.MODERATE_MEMBERS,
  VIEW_CHANNEL_INSIGHTS: Permission.VIEW_CHANNEL_INSIGHTS,
  USE_SOUNDBOARD: Permission.USE_SOUNDBOARD,
  CREATE_EVENTS: Permission.CREATE_EVENTS,

  // Admin
  ADMINISTRATOR: Permission.ADMINISTRATOR,
} as const;

// Permission names for display
export const PERMISSION_NAMES: Record<Permission, string> = {
  [Permission.MANAGE_SERVER]: 'Manage Server',
  [Permission.VIEW_SERVER]: 'View Server',
  [Permission.MANAGE_ROLES]: 'Manage Roles',
  [Permission.MANAGE_CHANNELS]: 'Manage Channels',
  [Permission.MANAGE_MEMBERS]: 'Manage Members',
  [Permission.KICK_MEMBERS]: 'Kick Members',
  [Permission.BAN_MEMBERS]: 'Ban Members',
  [Permission.CREATE_INVITES]: 'Create Invites',
  [Permission.MANAGE_INVITES]: 'Manage Invites',
  [Permission.VIEW_AUDIT_LOG]: 'View Audit Log',
  [Permission.VIEW_CHANNEL]: 'View Channel',
  [Permission.SEND_MESSAGES]: 'Send Messages',
  [Permission.SEND_TTS_MESSAGES]: 'Send TTS Messages',
  [Permission.MANAGE_MESSAGES]: 'Manage Messages',
  [Permission.EMBED_LINKS]: 'Embed Links',
  [Permission.ATTACH_FILES]: 'Attach Files',
  [Permission.READ_MESSAGE_HISTORY]: 'Read Message History',
  [Permission.MENTION_EVERYONE]: 'Mention Everyone',
  [Permission.USE_EXTERNAL_EMOJIS]: 'Use External Emojis',
  [Permission.ADD_REACTIONS]: 'Add Reactions',
  [Permission.CONNECT]: 'Connect',
  [Permission.SPEAK]: 'Speak',
  [Permission.MUTE_MEMBERS]: 'Mute Members',
  [Permission.DEAFEN_MEMBERS]: 'Deafen Members',
  [Permission.MOVE_MEMBERS]: 'Move Members',
  [Permission.USE_VOICE_ACTIVATION]: 'Use Voice Activation',
  [Permission.PRIORITY_SPEAKER]: 'Priority Speaker',
  [Permission.USE_APPLICATION_COMMANDS]: 'Use Application Commands',
  [Permission.MANAGE_EVENTS]: 'Manage Events',
  [Permission.MANAGE_WEBHOOKS]: 'Manage Webhooks',
  [Permission.USE_EXTERNAL_STICKERS]: 'Use External Stickers',
  [Permission.SEND_VOICE_MESSAGES]: 'Send Voice Messages',
  // Note: MODERATE_MEMBERS, VIEW_CHANNEL_INSIGHTS, USE_SOUNDBOARD, CREATE_EVENTS, and ADMINISTRATOR
  // have duplicate enum values due to 32-bit integer overflow (1 << 32+ wraps around)
  // These permissions are not used in MVP, so we omit them from PERMISSION_NAMES
  // [Permission.MODERATE_MEMBERS]: 'Moderate Members', // Duplicate of MANAGE_SERVER
  // [Permission.VIEW_CHANNEL_INSIGHTS]: 'View Channel Insights', // Duplicate of VIEW_SERVER
  // [Permission.USE_SOUNDBOARD]: 'Use Soundboard', // Duplicate of MANAGE_ROLES
  // [Permission.CREATE_EVENTS]: 'Create Events', // Duplicate of MANAGE_CHANNELS
  // [Permission.ADMINISTRATOR]: 'Administrator', // Duplicate of MANAGE_MEMBERS
};

/** Per-permission metadata: name for display and whether it is enforced in UI/API (not Beta). */
export const PERMISSION_META: Partial<Record<Permission, { name: string; implemented: boolean }>> = {
  [Permission.MANAGE_SERVER]: { name: 'Manage Server', implemented: true },
  [Permission.VIEW_SERVER]: { name: 'View Server', implemented: true },
  [Permission.MANAGE_ROLES]: { name: 'Manage Roles', implemented: true },
  [Permission.MANAGE_CHANNELS]: { name: 'Manage Channels', implemented: true },
  [Permission.MANAGE_MEMBERS]: { name: 'Manage Members', implemented: true },
  [Permission.KICK_MEMBERS]: { name: 'Kick Members', implemented: true },
  [Permission.BAN_MEMBERS]: { name: 'Ban Members', implemented: true },
  [Permission.CREATE_INVITES]: { name: 'Create Invites', implemented: true },
  [Permission.MANAGE_INVITES]: { name: 'Manage Invites', implemented: true },
  [Permission.VIEW_AUDIT_LOG]: { name: 'View Audit Log', implemented: true },
  [Permission.VIEW_CHANNEL]: { name: 'View Channel', implemented: true },
  [Permission.SEND_MESSAGES]: { name: 'Send Messages', implemented: true },
  [Permission.SEND_TTS_MESSAGES]: { name: 'Send TTS Messages', implemented: false },
  [Permission.MANAGE_MESSAGES]: { name: 'Manage Messages', implemented: true },
  [Permission.EMBED_LINKS]: { name: 'Embed Links', implemented: false },
  [Permission.ATTACH_FILES]: { name: 'Attach Files', implemented: true },
  [Permission.READ_MESSAGE_HISTORY]: { name: 'Read Message History', implemented: true },
  [Permission.MENTION_EVERYONE]: { name: 'Mention Everyone', implemented: true },
  [Permission.USE_EXTERNAL_EMOJIS]: { name: 'Use External Emojis', implemented: false },
  [Permission.ADD_REACTIONS]: { name: 'Add Reactions', implemented: true },
  [Permission.CONNECT]: { name: 'Connect', implemented: true },
  [Permission.SPEAK]: { name: 'Speak', implemented: true },
  [Permission.MUTE_MEMBERS]: { name: 'Mute Members', implemented: true },
  [Permission.DEAFEN_MEMBERS]: { name: 'Deafen Members', implemented: true },
  [Permission.MOVE_MEMBERS]: { name: 'Move Members', implemented: false },
  [Permission.USE_VOICE_ACTIVATION]: { name: 'Use Voice Activation', implemented: false },
  [Permission.PRIORITY_SPEAKER]: { name: 'Priority Speaker', implemented: false },
  [Permission.USE_APPLICATION_COMMANDS]: { name: 'Use Application Commands', implemented: false },
  [Permission.MANAGE_EVENTS]: { name: 'Manage Events', implemented: false },
  [Permission.MANAGE_WEBHOOKS]: { name: 'Manage Webhooks', implemented: false },
  [Permission.USE_EXTERNAL_STICKERS]: { name: 'Use External Stickers', implemented: false },
  [Permission.SEND_VOICE_MESSAGES]: { name: 'Send Voice Messages', implemented: false },
};

/** Server base permissions: always participate in calculateFinalPermissions and UI logic; cannot be Beta. */
export const BASE_PERMISSIONS: Permission[] = [
  Permission.VIEW_SERVER,
  Permission.VIEW_CHANNEL,
  Permission.SEND_MESSAGES,
  Permission.ADD_REACTIONS,
  Permission.ATTACH_FILES,
  Permission.CONNECT,
  Permission.SPEAK,
  Permission.MANAGE_ROLES,
  Permission.MANAGE_CHANNELS,
  Permission.MANAGE_SERVER,
];

// Check if a permission set includes a specific permission
export function hasPermission(permissions: number, permission: Permission): boolean {
  // Administrator has all permissions
  if ((permissions & Permission.ADMINISTRATOR) === Permission.ADMINISTRATOR) {
    return true;
  }

  return (permissions & permission) === permission;
}

// Combine multiple permissions
export function combinePermissions(...permissions: Permission[]): number {
  return permissions.reduce((acc, perm) => acc | perm, 0);
}

// Build API permission flags from final permission bits (shared by view + permissions/check)
export function flagsFromFinal(final: number): PermissionFlags {
  return {
    canViewServer: hasPermission(final, Permission.VIEW_SERVER),
    canViewChannel: hasPermission(final, Permission.VIEW_CHANNEL),
    canSendMessages: hasPermission(final, Permission.SEND_MESSAGES),
    canAttachFiles: hasPermission(final, Permission.ATTACH_FILES),
    canAddReactions: hasPermission(final, Permission.ADD_REACTIONS),
    canConnect: hasPermission(final, Permission.CONNECT),
    canSpeak: hasPermission(final, Permission.SPEAK),
    canManageMessages: hasPermission(final, Permission.MANAGE_MESSAGES),
    canManageRoles: hasPermission(final, Permission.MANAGE_ROLES),
    canManageChannels: hasPermission(final, Permission.MANAGE_CHANNELS),
    canManageMembers: hasPermission(final, Permission.MANAGE_MEMBERS),
    canKickMembers: hasPermission(final, Permission.KICK_MEMBERS),
    canBanMembers: hasPermission(final, Permission.BAN_MEMBERS),
    canCreateInvites: hasPermission(final, Permission.CREATE_INVITES),
    canManageInvites: hasPermission(final, Permission.MANAGE_INVITES),
    canViewAuditLog: hasPermission(final, Permission.VIEW_AUDIT_LOG),
    canMentionEveryone: hasPermission(final, Permission.MENTION_EVERYONE),
    canMuteMembers: hasPermission(final, Permission.MUTE_MEMBERS),
    canDeafenMembers: hasPermission(final, Permission.DEAFEN_MEMBERS),
  };
}
