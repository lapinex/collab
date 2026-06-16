/**
 * Type exports for centralized constants. Shapes mirror lib/constants.ts.
 * For actual values, import from @/lib/constants (app) or use API/WS constants in services.
 */

export type MessageLimits = {
  MAX_CONTENT_LENGTH: number;
  MAX_REPLY_DEPTH: number;
  MAX_ATTACHMENTS_PER_MESSAGE: number;
  MAX_MESSAGES_PER_MINUTE: number;
  MAX_EDIT_TIME_MINUTES: number;
  MAX_MENTION_OPTIONS: number;
};

export type FileLimits = {
  MAX_FILE_SIZE: number;
  MAX_IMAGE_SIZE: number;
  MAX_VIDEO_SIZE: number;
  MAX_GIF_SIZE: number;
  ALLOWED_IMAGE_TYPES: readonly string[];
  ALLOWED_VIDEO_TYPES: readonly string[];
};

export type ServerLimits = {
  MAX_CHANNELS_PER_SERVER: number;
  MAX_ROLES_PER_SERVER: number;
  MAX_EMOJIS_PER_SERVER: number;
  MAX_STICKERS_PER_SERVER: number;
  MAX_MEMBERS_PER_SERVER: number;
  MAX_INVITES_PER_SERVER: number;
  MAX_SERVER_NAME_LENGTH: number;
  MAX_ROLE_NAME_LENGTH: number;
  MAX_CHANNEL_NAME_LENGTH: number;
  MAX_CHANNEL_TOPIC_LENGTH: number;
  MAX_DESCRIPTION_LENGTH: number;
};

export type UserLimits = {
  MAX_SERVERS_PER_USER: number;
  MAX_FRIENDS: number;
  MAX_DM_CHANNELS: number;
  MAX_BLOCKED_USERS: number;
  MAX_USERNAME_LENGTH: number;
  MIN_USERNAME_LENGTH: number;
  MAX_BIO_LENGTH: number;
  MAX_DISPLAY_NAME_LENGTH: number;
  MIN_PASSWORD_LENGTH: number;
  MAX_CUSTOM_STATUS_LENGTH: number;
};

export type RateLimitsConfig = {
  API_DEFAULT: { windowMs: number; max: number };
  API_AUTH: { windowMs: number; max: number };
  API_MESSAGES: { windowMs: number; max: number };
  API_PRESENCE: { windowMs: number; max: number };
};

export type PaginationLimits = {
  MESSAGES_DEFAULT_LIMIT: number;
  MESSAGES_MAX_LIMIT: number;
  MEMBERS_DEFAULT_LIMIT: number;
  MEMBERS_MAX_LIMIT: number;
  SERVERS_DEFAULT_LIMIT: number;
  SERVERS_MAX_LIMIT: number;
  CHANNELS_DEFAULT_LIMIT: number;
  CHANNELS_MAX_LIMIT: number;
};

export type EmojiStickerLimits = {
  MAX_EMOJI_SIZE: number;
  MAX_STICKER_SIZE: number;
  MAX_EMOJI_NAME_LENGTH: number;
  MAX_STICKER_NAME_LENGTH: number;
};
