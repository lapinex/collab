/* eslint-disable @typescript-eslint/no-empty-object-type */
import {
  pgTable,
  text,
  uuid,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
  primaryKey,
  jsonb,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Users table
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url').$type<string | null>(),
  bio: text('bio'),
  emailVerified: boolean('email_verified').notNull().default(false),
  theme: text('theme').notNull().default('collab'),
  globalRole: text('global_role').notNull().default('user'), // 'user' | 'moderator' | 'admin'
  licenseAccepted: boolean('license_accepted').notNull().default(false),
  licenseAcceptedAt: timestamp('license_accepted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Sessions table
export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('sessions_user_id_idx').on(table.userId),
  tokenHashIdx: index('sessions_token_hash_idx').on(table.tokenHash),
}));

// Developer codes table
export const developerCodes = pgTable('developer_codes', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  used: boolean('used').notNull().default(false),
  usedBy: uuid('used_by').references(() => users.id),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Email whitelist table
export const emailWhitelist = pgTable('email_whitelist', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Servers table
export const servers = pgTable('servers', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  iconUrl: text('icon_url'),
  description: text('description'),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Overview settings
  verificationLevel: text('verification_level').notNull().default('none'), // 'none' | 'low' | 'medium' | 'high' | 'very_high'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  systemChannelId: uuid('system_channel_id').references((): any => channels.id, { onDelete: 'set null' }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rulesChannelId: uuid('rules_channel_id').references((): any => channels.id, { onDelete: 'set null' }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  defaultNotificationChannelId: uuid('default_notification_channel_id').references((): any => channels.id, { onDelete: 'set null' }),
  voiceRegion: text('voice_region').notNull().default('auto'), // 'auto' | region code
  // Security/Moderation settings
  mediaScanLevel: text('media_scan_level').notNull().default('none'), // 'none' | 'basic' | 'strict'
  linkFilterEnabled: boolean('link_filter_enabled').notNull().default(false),
  badWordsFilterLevel: text('bad_words_filter_level').notNull().default('none'), // 'none' | 'basic' | 'strict'
  customBadWords: jsonb('custom_bad_words').$type<string[]>().default([]),
  // Community mode
  isCommunity: boolean('is_community').notNull().default(false),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  announcementsChannelId: uuid('announcements_channel_id').references((): any => channels.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Server invitations table
export const serverInvitations = pgTable('server_invitations', {
  id: uuid('id').defaultRandom().primaryKey(),
  serverId: uuid('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  code: text('code').notNull().unique(),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at'),
  maxUses: integer('max_uses'),
  uses: integer('uses').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  serverIdIdx: index('server_invitations_server_id_idx').on(table.serverId),
}));

// Banned members (server bans)
export const bannedMembers = pgTable('banned_members', {
  id: uuid('id').defaultRandom().primaryKey(),
  serverId: uuid('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  bannedBy: uuid('banned_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  reason: text('reason'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  serverUserIdx: uniqueIndex('banned_members_server_user_idx').on(table.serverId, table.userId),
  serverIdIdx: index('banned_members_server_id_idx').on(table.serverId),
}));

// Invite uses (who used which invite, when)
export const serverInviteUses = pgTable('server_invite_uses', {
  id: uuid('id').defaultRandom().primaryKey(),
  inviteId: uuid('invite_id').notNull().references(() => serverInvitations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  usedAt: timestamp('used_at').notNull().defaultNow(),
}, (table) => ({
  inviteIdIdx: index('server_invite_uses_invite_id_idx').on(table.inviteId),
}));

// Invite audit log (created | deleted | used). inviteId nullable so "deleted" rows persist after invite is removed.
export const inviteAuditLog = pgTable('invite_audit_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  serverId: uuid('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  inviteId: uuid('invite_id').references(() => serverInvitations.id, { onDelete: 'set null' }),
  action: text('action').notNull(), // 'created' | 'deleted' | 'used'
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  inviteIdIdx: index('invite_audit_log_invite_id_idx').on(table.inviteId),
  serverIdIdx: index('invite_audit_log_server_id_idx').on(table.serverId),
}));

// Server audit log (Discord-style: who did what, target, meta)
export const serverAuditLogs = pgTable('server_audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  serverId: uuid('server_id').references(() => servers.id, { onDelete: 'cascade' }),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: uuid('target_id'),
  meta: jsonb('meta').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  serverIdIdx: index('server_audit_logs_server_id_idx').on(table.serverId),
  createdAtIdx: index('server_audit_logs_created_at_idx').on(table.serverId, table.createdAt),
}));

// Channels table
export const channels = pgTable('channels', {
  id: uuid('id').defaultRandom().primaryKey(),
  serverId: uuid('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'text' | 'voice' | 'category' | 'announcements' | 'forum'
  position: integer('position').notNull().default(0),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parentId: uuid('parent_id').references((): any => channels.id, { onDelete: 'set null' }),
  // Channel settings
  topic: text('topic'),
  slowmode: integer('slowmode').notNull().default(0), // seconds, 0 = disabled
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  serverIdIdx: index('channels_server_id_idx').on(table.serverId),
  parentIdIdx: index('channels_parent_id_idx').on(table.parentId),
}));

// Roles table
export const roles = pgTable('roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  serverId: uuid('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color').notNull().default('#99aab5'),
  position: integer('position').notNull().default(0),
  permissions: integer('permissions').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  serverIdIdx: index('roles_server_id_idx').on(table.serverId),
  positionIdx: index('roles_position_idx').on(table.serverId, table.position),
}));

// User roles table
export const userRoles = pgTable('user_roles', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  serverId: uuid('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.roleId, table.serverId] }),
  userIdIdx: index('user_roles_user_id_idx').on(table.userId),
  roleIdIdx: index('user_roles_role_id_idx').on(table.roleId),
  serverIdIdx: index('user_roles_server_id_idx').on(table.serverId),
}));

// Channel permissions table
export const channelPermissions = pgTable('channel_permissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  channelId: uuid('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  roleId: uuid('role_id').references(() => roles.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  allowPermissions: integer('allow_permissions').notNull().default(0),
  denyPermissions: integer('deny_permissions').notNull().default(0),
}, (table) => ({
  channelIdIdx: index('channel_permissions_channel_id_idx').on(table.channelId),
  roleIdIdx: index('channel_permissions_role_id_idx').on(table.roleId),
  userIdIdx: index('channel_permissions_user_id_idx').on(table.userId),
}));

// MessageMention shape for JSONB: { type: 'user'|'role'|'everyone', id?: string }
// Messages table (channel_id can reference channels.id or dm_channels.id)
export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  channelId: uuid('channel_id').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  replyToMessageId: uuid('reply_to_message_id').references((): any => messages.id, { onDelete: 'set null' }),
  mentions: jsonb('mentions').$type<Array<{ type: string; id?: string }>>(),
  editedAt: timestamp('edited_at'),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  channelIdIdx: index('messages_channel_id_idx').on(table.channelId),
  userIdIdx: index('messages_user_id_idx').on(table.userId),
  createdAtIdx: index('messages_created_at_idx').on(table.channelId, table.createdAt),
  replyToMessageIdIdx: index('messages_reply_to_message_id_idx').on(table.replyToMessageId),
}));

// Message edits table
export const messageEdits = pgTable('message_edits', {
  id: uuid('id').defaultRandom().primaryKey(),
  messageId: uuid('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  editedAt: timestamp('edited_at').notNull().defaultNow(),
}, (table) => ({
  messageIdIdx: index('message_edits_message_id_idx').on(table.messageId),
}));

// Reactions table
export const reactions = pgTable('reactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  messageId: uuid('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  emoji: text('emoji').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  messageIdIdx: index('reactions_message_id_idx').on(table.messageId),
  userIdIdx: index('reactions_user_id_idx').on(table.userId),
  uniqueReaction: uniqueIndex('reactions_message_user_emoji_idx').on(table.messageId, table.userId, table.emoji),
}));

// Voice sessions table
export const voiceSessions = pgTable('voice_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  channelId: uuid('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  joinedAt: timestamp('joined_at').notNull().defaultNow(),
  leftAt: timestamp('left_at'),
}, (table) => ({
  userIdIdx: index('voice_sessions_user_id_idx').on(table.userId),
  channelIdIdx: index('voice_sessions_channel_id_idx').on(table.channelId),
}));

// Media files table (channel_id = server channel only; for DM messages use message_id only, channel_id = null)
export const mediaFiles = pgTable('media_files', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  channelId: uuid('channel_id').references(() => channels.id, { onDelete: 'set null' }),
  messageId: uuid('message_id').references(() => messages.id, { onDelete: 'set null' }),
  fileName: text('file_name').notNull(),
  fileSize: integer('file_size').notNull(),
  mimeType: text('mime_type').notNull(),
  storageKey: text('storage_key').notNull(),
  cdnUrl: text('cdn_url'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('media_files_user_id_idx').on(table.userId),
  channelIdIdx: index('media_files_channel_id_idx').on(table.channelId),
  messageIdIdx: index('media_files_message_id_idx').on(table.messageId),
}));

// Direct message channels table
export const dmChannels = pgTable('dm_channels', {
  id: uuid('id').defaultRandom().primaryKey(),
  user1Id: uuid('user1_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  user2Id: uuid('user2_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  lastMessageId: uuid('last_message_id'), // Reference to messages.id (DM last message)
  lastMessageAt: timestamp('last_message_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  user1IdIdx: index('dm_channels_user1_id_idx').on(table.user1Id),
  user2IdIdx: index('dm_channels_user2_id_idx').on(table.user2Id),
  uniquePair: uniqueIndex('dm_channels_user_pair_idx').on(table.user1Id, table.user2Id),
}));

// Notifications table (mention, dm, reply, call, friend, invite, etc.)
export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  messageId: uuid('message_id').references(() => messages.id, { onDelete: 'cascade' }),
  channelId: uuid('channel_id'),
  serverId: uuid('server_id').references(() => servers.id, { onDelete: 'cascade' }),
  dmId: uuid('dm_id').references(() => dmChannels.id, { onDelete: 'cascade' }),
  payload: jsonb('payload').$type<Record<string, unknown>>(),
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('notifications_user_id_idx').on(table.userId),
  readAtIdx: index('notifications_read_at_idx').on(table.userId, table.readAt),
  createdAtIdx: index('notifications_created_at_idx').on(table.userId, table.createdAt),
  dmIdIdx: index('notifications_dm_id_idx').on(table.dmId),
  typeIdx: index('notifications_type_idx').on(table.userId, table.type),
}));

// Audit logs table
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  metadata: jsonb('metadata'), // Native JSONB type for PostgreSQL
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('audit_logs_user_id_idx').on(table.userId),
  resourceIdx: index('audit_logs_resource_idx').on(table.resourceType, table.resourceId),
  createdAtIdx: index('audit_logs_created_at_idx').on(table.createdAt),
}));

// User settings table
export const userSettings = pgTable('user_settings', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  language: text('language').notNull().default('en'),
  location: text('location'), // User location/region for translation (e.g., 'CIS', 'Germany', 'France')
  autoTranslate: boolean('auto_translate').notNull().default(false),
  preferredLanguage: text('preferred_language').notNull().default('en'),
  notificationsEnabled: boolean('notifications_enabled').notNull().default(true),
  notificationsSound: boolean('notifications_sound').notNull().default(true),
  notificationsMentions: boolean('notifications_mentions').notNull().default(true),
  privacyShowEmail: boolean('privacy_show_email').notNull().default(false),
  privacyShowOnlineStatus: boolean('privacy_show_online_status').notNull().default(true),
  // Privacy / Communication (Discord-like)
  allowDm: boolean('allow_dm').notNull().default(true),
  allowDmFromNonMutual: boolean('allow_dm_from_non_mutual').notNull().default(false),
  allowFriendRequests: boolean('allow_friend_requests').notNull().default(true),
  // Notifications mode: all | mentions | none
  notificationsMode: text('notifications_mode').notNull().default('all'),
  // Voice
  voiceInputDevice: text('voice_input_device'),
  voiceOutputDevice: text('voice_output_device'),
  voiceScreenShareSound: boolean('voice_screen_share_sound').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Friend requests
export const friendRequests = pgTable('friend_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  fromUserId: uuid('from_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  toUserId: uuid('to_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('pending'), // pending | accepted | declined | canceled
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  uniqueFromTo: uniqueIndex('friend_requests_from_to_idx').on(table.fromUserId, table.toUserId),
  fromUserIdIdx: index('friend_requests_from_user_id_idx').on(table.fromUserId),
  toUserIdIdx: index('friend_requests_to_user_id_idx').on(table.toUserId),
}));

// Friends (bidirectional: (A,B) and (B,A))
export const friends = pgTable('friends', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  friendId: uuid('friend_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.friendId] }),
  userIdIdx: index('friends_user_id_idx').on(table.userId),
  friendIdIdx: index('friends_friend_id_idx').on(table.friendId),
}));

// User blocks (blacklist)
export const userBlocks = pgTable('user_blocks', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  blockedUserId: uuid('blocked_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.blockedUserId] }),
  userIdIdx: index('user_blocks_user_id_idx').on(table.userId),
  blockedUserIdIdx: index('user_blocks_blocked_user_id_idx').on(table.blockedUserId),
}));

// User sessions (devices)
export const userSessions = pgTable('user_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  userAgent: text('user_agent'),
  ip: text('ip'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  lastActiveAt: timestamp('last_active_at').notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('user_sessions_user_id_idx').on(table.userId),
}));

// Presence table
export const presence = pgTable('presence', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('offline'),
  customStatus: text('custom_status'),
  lastSeen: timestamp('last_seen').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Server profiles table (nickname and avatar per server)
export const serverProfiles = pgTable('server_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  serverId: uuid('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  nickname: text('nickname'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  uniqueUserServer: uniqueIndex('server_profiles_user_server_idx').on(table.userId, table.serverId),
  userIdIdx: index('server_profiles_user_id_idx').on(table.userId),
  serverIdIdx: index('server_profiles_server_id_idx').on(table.serverId),
}));

// Server emojis table
export const serverEmojis = pgTable('server_emojis', {
  id: uuid('id').defaultRandom().primaryKey(),
  serverId: uuid('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  url: text('url').notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  serverIdIdx: index('server_emojis_server_id_idx').on(table.serverId),
  nameIdx: index('server_emojis_name_idx').on(table.serverId, table.name),
}));

// Server stickers table
export const serverStickers = pgTable('server_stickers', {
  id: uuid('id').defaultRandom().primaryKey(),
  serverId: uuid('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  url: text('url').notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  serverIdIdx: index('server_stickers_server_id_idx').on(table.serverId),
  nameIdx: index('server_stickers_name_idx').on(table.serverId, table.name),
}));

// Webhooks table
export const webhooks = pgTable('webhooks', {
  id: uuid('id').defaultRandom().primaryKey(),
  serverId: uuid('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  channelId: uuid('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  url: text('url').notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  serverIdIdx: index('webhooks_server_id_idx').on(table.serverId),
  channelIdIdx: index('webhooks_channel_id_idx').on(table.channelId),
}));

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  sessions: many(sessions),
  servers: many(servers),
  messages: many(messages),
  reactions: many(reactions),
  userRoles: many(userRoles),
  settings: one(userSettings),
  presence: one(presence),
  serverProfiles: many(serverProfiles),
  userBlocks: many(userBlocks),
  userSessions: many(userSessions),
  friendRequestsFrom: many(friendRequests, { relationName: 'friendRequestsFrom' }),
  friendRequestsTo: many(friendRequests, { relationName: 'friendRequestsTo' }),
  friends: many(friends, { relationName: 'userFriends' }),
  friendOf: many(friends, { relationName: 'friendOf' }),
}));

export const serversRelations = relations(servers, ({ one, many }) => ({
  owner: one(users, {
    fields: [servers.ownerId],
    references: [users.id],
  }),
  channels: many(channels),
  roles: many(roles),
  userRoles: many(userRoles),
  serverProfiles: many(serverProfiles),
  invitations: many(serverInvitations),
  emojis: many(serverEmojis),
  stickers: many(serverStickers),
  webhooks: many(webhooks),
  systemChannel: one(channels, {
    fields: [servers.systemChannelId],
    references: [channels.id],
  }),
  rulesChannel: one(channels, {
    fields: [servers.rulesChannelId],
    references: [channels.id],
  }),
  defaultNotificationChannel: one(channels, {
    fields: [servers.defaultNotificationChannelId],
    references: [channels.id],
  }),
  announcementsChannel: one(channels, {
    fields: [servers.announcementsChannelId],
    references: [channels.id],
  }),
}));

export const channelsRelations = relations(channels, ({ one, many }) => ({
  server: one(servers, {
    fields: [channels.serverId],
    references: [servers.id],
  }),
  parent: one(channels, {
    fields: [channels.parentId],
    references: [channels.id],
  }),
  children: many(channels),
  messages: many(messages, { relationName: 'channelMessages' }),
  permissions: many(channelPermissions),
}));

export const rolesRelations = relations(roles, ({ one, many }) => ({
  server: one(servers, {
    fields: [roles.serverId],
    references: [servers.id],
  }),
  userRoles: many(userRoles),
  channelPermissions: many(channelPermissions),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  channel: one(channels, {
    fields: [messages.channelId],
    references: [channels.id],
    relationName: 'channelMessages',
  }),
  dmChannel: one(dmChannels, {
    fields: [messages.channelId],
    references: [dmChannels.id],
    relationName: 'dmChannelMessages',
  }),
  user: one(users, {
    fields: [messages.userId],
    references: [users.id],
  }),
  replyTo: one(messages, {
    fields: [messages.replyToMessageId],
    references: [messages.id],
  }),
  replies: many(messages),
  edits: many(messageEdits),
  reactions: many(reactions),
  mediaFiles: many(mediaFiles),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
  role: one(roles, {
    fields: [userRoles.roleId],
    references: [roles.id],
  }),
  server: one(servers, {
    fields: [userRoles.serverId],
    references: [servers.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const messageEditsRelations = relations(messageEdits, ({ one }) => ({
  message: one(messages, {
    fields: [messageEdits.messageId],
    references: [messages.id],
  }),
}));

export const reactionsRelations = relations(reactions, ({ one }) => ({
  message: one(messages, {
    fields: [reactions.messageId],
    references: [messages.id],
  }),
  user: one(users, {
    fields: [reactions.userId],
    references: [users.id],
  }),
}));

export const channelPermissionsRelations = relations(channelPermissions, ({ one }) => ({
  channel: one(channels, {
    fields: [channelPermissions.channelId],
    references: [channels.id],
  }),
  role: one(roles, {
    fields: [channelPermissions.roleId],
    references: [roles.id],
  }),
  user: one(users, {
    fields: [channelPermissions.userId],
    references: [users.id],
  }),
}));

export const voiceSessionsRelations = relations(voiceSessions, ({ one }) => ({
  user: one(users, {
    fields: [voiceSessions.userId],
    references: [users.id],
  }),
  channel: one(channels, {
    fields: [voiceSessions.channelId],
    references: [channels.id],
  }),
}));

export const mediaFilesRelations = relations(mediaFiles, ({ one }) => ({
  user: one(users, {
    fields: [mediaFiles.userId],
    references: [users.id],
  }),
  channel: one(channels, {
    fields: [mediaFiles.channelId],
    references: [channels.id],
  }),
  message: one(messages, {
    fields: [mediaFiles.messageId],
    references: [messages.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

export const userSettingsRelations = relations(userSettings, ({ one }) => ({
  user: one(users, {
    fields: [userSettings.userId],
    references: [users.id],
  }),
}));

export const friendRequestsRelations = relations(friendRequests, ({ one }) => ({
  fromUser: one(users, {
    fields: [friendRequests.fromUserId],
    references: [users.id],
    relationName: 'friendRequestsFrom',
  }),
  toUser: one(users, {
    fields: [friendRequests.toUserId],
    references: [users.id],
    relationName: 'friendRequestsTo',
  }),
}));

export const friendsRelations = relations(friends, ({ one }) => ({
  user: one(users, {
    fields: [friends.userId],
    references: [users.id],
    relationName: 'userFriends',
  }),
  friend: one(users, {
    fields: [friends.friendId],
    references: [users.id],
    relationName: 'friendOf',
  }),
}));

export const userBlocksRelations = relations(userBlocks, ({ one }) => ({
  user: one(users, {
    fields: [userBlocks.userId],
    references: [users.id],
  }),
  blockedUser: one(users, {
    fields: [userBlocks.blockedUserId],
    references: [users.id],
  }),
}));

export const userSessionsRelations = relations(userSessions, ({ one }) => ({
  user: one(users, {
    fields: [userSessions.userId],
    references: [users.id],
  }),
}));

export const presenceRelations = relations(presence, ({ one }) => ({
  user: one(users, {
    fields: [presence.userId],
    references: [users.id],
  }),
}));

export const dmChannelsRelations = relations(dmChannels, ({ one, many }) => ({
  user1: one(users, {
    fields: [dmChannels.user1Id],
    references: [users.id],
  }),
  user2: one(users, {
    fields: [dmChannels.user2Id],
    references: [users.id],
  }),
  lastMessage: one(messages, {
    fields: [dmChannels.lastMessageId],
    references: [messages.id],
  }),
  messages: many(messages, { relationName: 'dmChannelMessages' }),
}));

export const serverProfilesRelations = relations(serverProfiles, ({ one }) => ({
  user: one(users, {
    fields: [serverProfiles.userId],
    references: [users.id],
  }),
  server: one(servers, {
    fields: [serverProfiles.serverId],
    references: [servers.id],
  }),
}));

export const serverInvitationsRelations = relations(serverInvitations, ({ one }) => ({
  server: one(servers, {
    fields: [serverInvitations.serverId],
    references: [servers.id],
  }),
  creator: one(users, {
    fields: [serverInvitations.createdBy],
    references: [users.id],
  }),
}));

export const serverAuditLogsRelations = relations(serverAuditLogs, ({ one }) => ({
  server: one(servers, {
    fields: [serverAuditLogs.serverId],
    references: [servers.id],
  }),
  actor: one(users, {
    fields: [serverAuditLogs.actorId],
    references: [users.id],
  }),
}));

export const serverEmojisRelations = relations(serverEmojis, ({ one }) => ({
  server: one(servers, {
    fields: [serverEmojis.serverId],
    references: [servers.id],
  }),
  creator: one(users, {
    fields: [serverEmojis.createdBy],
    references: [users.id],
  }),
}));

export const serverStickersRelations = relations(serverStickers, ({ one }) => ({
  server: one(servers, {
    fields: [serverStickers.serverId],
    references: [servers.id],
  }),
  creator: one(users, {
    fields: [serverStickers.createdBy],
    references: [users.id],
  }),
}));

export const webhooksRelations = relations(webhooks, ({ one }) => ({
  server: one(servers, {
    fields: [webhooks.serverId],
    references: [servers.id],
  }),
  channel: one(channels, {
    fields: [webhooks.channelId],
    references: [channels.id],
  }),
  creator: one(users, {
    fields: [webhooks.createdBy],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
  message: one(messages, { fields: [notifications.messageId], references: [messages.id] }),
  server: one(servers, { fields: [notifications.serverId], references: [servers.id] }),
}));
