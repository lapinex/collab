/**
 * Navigate to the source of a notification (channel, DM, friends, etc.).
 * Call from NotificationCenter click or desktop notification onclick.
 */
import type { NotificationDto } from '@/types/notifications';
import { getNotificationUrl } from './resolveNotificationTarget';

export async function navigateToNotification(
  notification: NotificationDto,
  options: {
    routerPush: (url: string) => void;
    markAsRead?: (id: string) => Promise<void>;
    focusWindow?: () => void;
  }
): Promise<void> {
  const { routerPush, markAsRead, focusWindow } = options;
  focusWindow?.();
  const url = getNotificationUrl(notification);
  if (notification.id && markAsRead) {
    try {
      await markAsRead(notification.id);
    } catch {
      // non-fatal
    }
  }
  routerPush(url);
}
