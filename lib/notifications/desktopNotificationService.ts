/**
 * Desktop (Web Notifications API) service: permission, show, onclick → navigate.
 */
import type { NotificationDto } from '@/types/notifications';
import { NOTIFICATION_PRIORITY } from '@/types/notifications';
import { getNotificationUrl } from './resolveNotificationTarget';

export type NotificationPermission = 'default' | 'granted' | 'denied';

export function getNotificationPermission(): NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
  return (Notification.permission as NotificationPermission) ?? 'default';
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  const result = await Notification.requestPermission();
  return result as NotificationPermission;
}

function getNotificationTitle(notification: NotificationDto): string {
  const type = notification.type;
  const payload = notification.payload as Record<string, unknown> | null;
  switch (type) {
    case 'mention:channel':
      return payload?.authorName && payload?.channelName
        ? `${String(payload.authorName)} упомянул(а) вас в #${String(payload.channelName)}`
        : 'Вас упомянули в канале';
    case 'message:dm':
      return payload?.authorName
        ? `${String(payload.authorName)} написал(а) вам`
        : 'Новое сообщение в DM';
    case 'call:incoming:dm':
      return payload?.callerName
        ? `Входящий звонок от ${String(payload.callerName)}`
        : 'Входящий звонок';
    case 'friend:request':
      return payload?.fromUserName
        ? `Запрос в друзья от ${String(payload.fromUserName)}`
        : 'Запрос в друзья';
    case 'friend:accepted':
      return payload?.userName
        ? `${String(payload.userName)} принял(а) запрос в друзья`
        : 'Запрос в друзья принят';
    case 'server:invite':
      return payload?.serverName
        ? `Приглашение на сервер ${String(payload.serverName)}`
        : 'Приглашение на сервер';
    case 'system':
      return (payload?.title as string) ?? 'Уведомление';
    default:
      return 'Уведомление';
  }
}

function getNotificationBody(notification: NotificationDto, hidePreview: boolean): string {
  if (hidePreview) return '';
  const payload = notification.payload as Record<string, unknown> | null;
  const snippet = payload?.snippet;
  if (snippet && typeof snippet === 'string') {
    return snippet.slice(0, 150);
  }
  if (notification.type === 'system' && payload?.body) return String(payload.body);
  return '';
}

/** Tag for coalescing: same tag replaces previous. Use for DMs/channel to avoid flood. */
function getNotificationTag(notification: NotificationDto): string {
  const type = notification.type;
  const payload = notification.payload as unknown as Record<string, unknown> | null;
  const channelId = notification.channelId ?? payload?.channelId;
  const dmId = notification.dmId ?? payload?.dmId;
  if (type === 'message:dm' && dmId) return `dm:${dmId}`;
  if (type === 'mention:channel' && channelId) return `mention:${channelId}`;
  if (type === 'call:incoming:dm') return `call:dm:${dmId ?? notification.channelId}`;
  return `notif:${notification.id}`;
}

export interface ShowDesktopNotificationOptions {
  notification: NotificationDto;
  hidePreview?: boolean;
  sound?: boolean;
  onClick?: (notification: NotificationDto) => void;
}

export function showDesktopNotification(options: ShowDesktopNotificationOptions): Notification | null {
  const { notification, hidePreview = false, sound: _sound = true, onClick } = options;
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
    return null;
  }
  const title = getNotificationTitle(notification);
  const body = getNotificationBody(notification, hidePreview);
  const tag = getNotificationTag(notification);
  const priority = NOTIFICATION_PRIORITY[notification.type as keyof typeof NOTIFICATION_PRIORITY] ?? 'normal';
  const requireInteraction = priority === 'high';
  const n = new Notification(title, {
    body: body || undefined,
    tag,
    requireInteraction,
    icon: '/favicon.ico',
  });
  n.onclick = () => {
    window.focus();
    n.close();
    if (onClick) {
      onClick(notification);
    } else {
      const url = getNotificationUrl(notification);
      window.location.href = url;
    }
  };
  return n;
}
