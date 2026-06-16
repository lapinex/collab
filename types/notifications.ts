/**
 * Notification taxonomy: types, payloads, deep-link targets.
 * Shared between API (emit) and frontend (display, routing).
 */

export const NOTIFICATION_TYPES = [
  'mention:channel',
  'message:dm',
  'message:channel',
  'call:incoming:dm',
  'call:incoming:server',
  'friend:request',
  'friend:accepted',
  'server:invite',
  'system',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationPayloadMentionChannel {
  serverId: string;
  channelId: string;
  messageId: string;
  authorId: string;
  authorName: string;
  channelName?: string;
  snippet?: string;
}

export interface NotificationPayloadMessageDm {
  dmId: string;
  messageId: string;
  authorId: string;
  authorName: string;
  snippet?: string;
}

export interface NotificationPayloadMessageChannel {
  serverId: string;
  channelId: string;
  messageId: string;
  authorId: string;
  authorName: string;
  channelName?: string;
  snippet?: string;
}

export interface NotificationPayloadCallIncomingDm {
  dmId: string;
  callId?: string;
  callerId: string;
  callerName: string;
}

export interface NotificationPayloadCallIncomingServer {
  serverId: string;
  channelId: string;
  callId?: string;
  callerId: string;
  callerName: string;
}

export interface NotificationPayloadFriendRequest {
  requestId: string;
  fromUserId: string;
  fromUserName: string;
}

export interface NotificationPayloadFriendAccepted {
  userId: string;
  userName: string;
}

export interface NotificationPayloadServerInvite {
  inviteId: string;
  serverId: string;
  serverName: string;
  invitedById: string;
  invitedByName: string;
}

export interface NotificationPayloadSystem {
  title: string;
  body?: string;
  link?: string;
}

export type NotificationPayload =
  | NotificationPayloadMentionChannel
  | NotificationPayloadMessageDm
  | NotificationPayloadMessageChannel
  | NotificationPayloadCallIncomingDm
  | NotificationPayloadCallIncomingServer
  | NotificationPayloadFriendRequest
  | NotificationPayloadFriendAccepted
  | NotificationPayloadServerInvite
  | NotificationPayloadSystem;

export type TargetRoute =
  | { type: 'channel'; serverId: string; channelId: string; messageId?: string }
  | { type: 'dm'; dmId: string; messageId?: string }
  | { type: 'call-dm'; dmId: string }
  | { type: 'call-server'; serverId: string; channelId: string }
  | { type: 'friends'; tab?: 'requests' }
  | { type: 'invites' }
  | { type: 'server'; serverId: string }
  | { type: 'url'; url: string }
  | null;

export interface NotificationDto {
  id: string;
  type: NotificationType | string;
  userId: string;
  messageId: string | null;
  channelId: string | null;
  serverId: string | null;
  dmId: string | null;
  readAt: string | null;
  createdAt: string;
  payload: NotificationPayload | null;
}

/** Priority for desktop: high = sound + requireInteraction for calls */
export type NotificationPriority = 'low' | 'normal' | 'high';

export const NOTIFICATION_PRIORITY: Record<NotificationType, NotificationPriority> = {
  'mention:channel': 'normal',
  'message:dm': 'normal',
  'message:channel': 'low',
  'call:incoming:dm': 'high',
  'call:incoming:server': 'high',
  'friend:request': 'normal',
  'friend:accepted': 'normal',
  'server:invite': 'normal',
  system: 'normal',
};

/** Title template keys (for i18n or static). */
export function getNotificationTitleKey(type: NotificationType): string {
  switch (type) {
    case 'mention:channel':
      return 'notification.mention_channel';
    case 'message:dm':
      return 'notification.message_dm';
    case 'message:channel':
      return 'notification.message_channel';
    case 'call:incoming:dm':
      return 'notification.call_incoming_dm';
    case 'call:incoming:server':
      return 'notification.call_incoming_server';
    case 'friend:request':
      return 'notification.friend_request';
    case 'friend:accepted':
      return 'notification.friend_accepted';
    case 'server:invite':
      return 'notification.server_invite';
    case 'system':
      return 'notification.system';
    default:
      return 'notification.generic';
  }
}
