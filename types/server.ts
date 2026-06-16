export interface Server {
  id: string;
  name: string;
  iconUrl: string | null;
  description: string | null;
  ownerId: string;
  // Overview settings
  verificationLevel: 'none' | 'low' | 'medium' | 'high' | 'very_high';
  systemChannelId: string | null;
  rulesChannelId: string | null;
  defaultNotificationChannelId: string | null;
  voiceRegion: string;
  // Security/Moderation settings
  mediaScanLevel: 'none' | 'basic' | 'strict';
  linkFilterEnabled: boolean;
  badWordsFilterLevel: 'none' | 'basic' | 'strict';
  customBadWords: string[];
  // Community mode
  isCommunity: boolean;
  announcementsChannelId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Channel {
  id: string;
  serverId: string;
  name: string;
  type: 'text' | 'voice' | 'category' | 'announcements' | 'forum';
  position: number;
  parentId: string | null;
  topic: string | null;
  slowmode: number; // seconds, 0 = disabled
  createdAt: Date;
  updatedAt: Date;
}

export interface Role {
  id: string;
  serverId: string;
  name: string;
  color: string;
  position: number;
  permissions: bigint;
  memberCount?: number; // optional: from API when available
  createdAt: Date;
  updatedAt: Date;
}

export interface UserRole {
  userId: string;
  roleId: string;
  serverId: string;
}

export interface ChannelPermission {
  id: string;
  channelId: string;
  roleId: string | null;
  userId: string | null;
  allowPermissions: bigint;
  denyPermissions: bigint;
}

export interface ServerEmoji {
  id: string;
  serverId: string;
  name: string;
  url: string;
  createdBy: string | null;
  createdAt: Date;
}

export interface ServerSticker {
  id: string;
  serverId: string;
  name: string;
  url: string;
  createdBy: string | null;
  createdAt: Date;
}

export interface Webhook {
  id: string;
  serverId: string;
  channelId: string;
  name: string;
  url: string;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}
