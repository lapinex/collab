/**
 * Resolve notification to target route for navigation.
 * Used by NotificationCenter and desktop notification onclick.
 */
import type { NotificationDto, TargetRoute } from '@/types/notifications';
import { buildAppUrl } from '@/lib/navigation/appStateUrl';

export function resolveNotificationTarget(notification: NotificationDto): TargetRoute {
  const type = notification.type;
  const payload = notification.payload as Record<string, unknown> | null;
  const serverId = notification.serverId ?? (payload?.serverId as string | undefined);
  const channelId = notification.channelId ?? (payload?.channelId as string | undefined);
  const dmId = notification.dmId ?? (payload?.dmId as string | undefined);
  const messageId = notification.messageId ?? (payload?.messageId as string | undefined);

  switch (type) {
    case 'mention:channel':
      if (serverId && channelId) {
        return { type: 'channel', serverId, channelId, messageId: messageId ?? undefined };
      }
      return null;
    case 'message:dm':
      if (dmId) {
        return { type: 'dm', dmId, messageId: messageId ?? undefined };
      }
      if (channelId) {
        return { type: 'dm', dmId: channelId, messageId: messageId ?? undefined };
      }
      return null;
    case 'message:channel':
      if (serverId && channelId) {
        return { type: 'channel', serverId, channelId, messageId: messageId ?? undefined };
      }
      return null;
    case 'call:incoming:dm':
      if (dmId) return { type: 'call-dm', dmId };
      if (channelId) return { type: 'call-dm', dmId: channelId };
      return null;
    case 'call:incoming:server':
      if (serverId && channelId) return { type: 'call-server', serverId, channelId };
      return null;
    case 'friend:request':
    case 'friend:accepted':
      return { type: 'friends', tab: 'requests' };
    case 'server:invite':
      if (serverId) return { type: 'server', serverId };
      return { type: 'invites' };
    case 'system':
      if (payload?.link && typeof payload.link === 'string') {
        return { type: 'url', url: payload.link };
      }
      return null;
    default:
      if (serverId && channelId) {
        return { type: 'channel', serverId, channelId, messageId: messageId ?? undefined };
      }
      if (dmId || channelId) {
        return { type: 'dm', dmId: dmId ?? channelId!, messageId: messageId ?? undefined };
      }
      return null;
  }
}

export function getNotificationUrl(notification: NotificationDto): string {
  const target = resolveNotificationTarget(notification);
  if (!target) return '/app';
  switch (target.type) {
    case 'channel':
      return buildAppUrl({
        tab: 'servers',
        serverId: target.serverId,
        channelId: target.channelId,
      }) + (target.messageId ? `&message=${target.messageId}` : '');
    case 'dm':
      return buildAppUrl({
        tab: 'dms',
        dmId: target.dmId,
      }) + (target.messageId ? `&message=${target.messageId}` : '');
    case 'call-dm':
      return buildAppUrl({ tab: 'dms', dmId: target.dmId });
    case 'call-server':
      return buildAppUrl({
        tab: 'servers',
        serverId: target.serverId,
        channelId: target.channelId,
      });
    case 'friends':
      return '/app/friends' + (target.tab ? `?tab=${target.tab}` : '');
    case 'invites':
      return '/app';
    case 'server':
      return buildAppUrl({ tab: 'servers', serverId: target.serverId });
    case 'url':
      return target.url.startsWith('/') ? target.url : `/app?${target.url}`;
    default:
      return '/app';
  }
}
