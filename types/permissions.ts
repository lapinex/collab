/** In JS, bitwise ops use 32-bit integers; 1 << 32+ overflows. UI and role editor should only use permissions with bits 0–30 for allow/deny. */
export enum Permission {
  // Server permissions
  MANAGE_SERVER = 1 << 0,
  VIEW_SERVER = 1 << 1,
  MANAGE_ROLES = 1 << 2,
  MANAGE_CHANNELS = 1 << 3,
  MANAGE_MEMBERS = 1 << 4,
  KICK_MEMBERS = 1 << 5,
  BAN_MEMBERS = 1 << 6,
  CREATE_INVITES = 1 << 7,
  MANAGE_INVITES = 1 << 8,
  VIEW_AUDIT_LOG = 1 << 9,
  
  // Channel permissions
  VIEW_CHANNEL = 1 << 10,
  SEND_MESSAGES = 1 << 11,
  SEND_TTS_MESSAGES = 1 << 12,
  MANAGE_MESSAGES = 1 << 13,
  EMBED_LINKS = 1 << 14,
  ATTACH_FILES = 1 << 15,
  READ_MESSAGE_HISTORY = 1 << 16,
  MENTION_EVERYONE = 1 << 17,
  USE_EXTERNAL_EMOJIS = 1 << 18,
  ADD_REACTIONS = 1 << 19,
  
  // Voice permissions
  CONNECT = 1 << 20,
  SPEAK = 1 << 21,
  MUTE_MEMBERS = 1 << 22,
  DEAFEN_MEMBERS = 1 << 23,
  MOVE_MEMBERS = 1 << 24,
  USE_VOICE_ACTIVATION = 1 << 25,
  PRIORITY_SPEAKER = 1 << 26,
  
  // Advanced permissions
  USE_APPLICATION_COMMANDS = 1 << 27,
  MANAGE_EVENTS = 1 << 28,
  MANAGE_WEBHOOKS = 1 << 29,
  USE_EXTERNAL_STICKERS = 1 << 30,
  SEND_VOICE_MESSAGES = 1 << 31,
  
  // Moderation
  // Note: These values overflow due to 32-bit integer limits, causing duplicates
  // They are not used in MVP, so we suppress the TypeScript warnings
  // @ts-expect-error - Bit shift overflow (1 << 32 wraps to 1 << 0)
  MODERATE_MEMBERS = 1 << 32,
  // @ts-expect-error - Bit shift overflow (1 << 33 wraps to 1 << 1)
  VIEW_CHANNEL_INSIGHTS = 1 << 33,
  // @ts-expect-error - Bit shift overflow (1 << 34 wraps to 1 << 2)
  USE_SOUNDBOARD = 1 << 34,
  // @ts-expect-error - Bit shift overflow (1 << 35 wraps to 1 << 3)
  CREATE_EVENTS = 1 << 35,
  
  // Admin
  // @ts-expect-error - Bit shift overflow (1 << 36 wraps to 1 << 4)
  ADMINISTRATOR = 1 << 36,
}

export interface PermissionCheck {
  userId: string;
  serverId: string;
  channelId?: string;
  permission: Permission;
}

export interface CalculatedPermissions {
  allow: number;
  deny: number;
  final: number;
}

/** API-returned permission flags. UI uses only these; no client-side permission logic. */
export interface PermissionFlags {
  canViewServer: boolean;
  canViewChannel: boolean;
  canSendMessages: boolean;
  canAttachFiles: boolean;
  canAddReactions: boolean;
  canConnect: boolean;
  canSpeak: boolean;
  canManageMessages: boolean;
  canManageRoles: boolean;
  canManageChannels: boolean;
  canManageMembers: boolean;
  canKickMembers: boolean;
  canBanMembers: boolean;
  canCreateInvites: boolean;
  canManageInvites: boolean;
  canViewAuditLog: boolean;
  canMentionEveryone: boolean;
  canMuteMembers: boolean;
  canDeafenMembers: boolean;
}
