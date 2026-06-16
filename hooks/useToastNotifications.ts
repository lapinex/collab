'use client';

import { getRealtimeManager } from '@/lib/realtime/RealtimeManager';
import { useAppStore, getCurrentOpenChannelId } from '@/stores/app-store';

export type ToastNotificationPayload = {
  id: string;
  type: string;
  messageId: string | null;
  channelId: string | null;
  serverId: string | null;
  createdAt: string;
  messagePreview?: string | null;
  author?: { id: string; username: string; avatar: string | null } | null;
  channelName?: string | null;
};

const TOAST_TYPES = new Set(['mention', 'dm', 'reply', 'call']);

function shouldShowToast(
  notification: ToastNotificationPayload,
  currentOpenChannelId: string | null
): boolean {
  if (!TOAST_TYPES.has(notification.type)) return false;
  const channelId = notification.channelId ?? null;
  if (!channelId) return false;
  if (currentOpenChannelId === channelId) return false;
  return true;
}

function shouldShowToastWithVisibility(): boolean {
  return typeof document !== 'undefined' && document.visibilityState !== 'visible';
}

/**
 * Subscribe to user notifications and call pushToast when a toast should be shown
 * (user not in that channel and type is mention | dm | reply | call).
 */
export function subscribeToUserNotifications(
  userId: string | null,
  pushToast: (notification: ToastNotificationPayload) => void
): () => void {
  if (!userId) return () => {};

  const topic = `user:${userId}`;
  const manager = getRealtimeManager();

  const unsub = manager.subscribeToBroadcast(
    topic,
    'notification:new',
    (payload: unknown) => {
      const n = payload as ToastNotificationPayload;
      const state = useAppStore.getState();
      const currentOpenChannelId = getCurrentOpenChannelId(state);
      if (shouldShowToast(n, currentOpenChannelId) && shouldShowToastWithVisibility()) {
        pushToast(n);
      }
    }
  );
  return unsub;
}
