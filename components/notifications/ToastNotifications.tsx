'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { getRealtimeManager } from '@/lib/realtime/RealtimeManager';
import { cn } from '@/lib/utils';

export interface NotificationNewPayload {
  id: string;
  type: string;
  messageId: string | null;
  channelId: string | null;
  serverId: string | null;
  createdAt: string;
}

interface ToastItem {
  id: string;
  type: string;
  channelId: string | null;
  serverId: string | null;
  text: string;
  createdAt: number;
}

interface ToastNotificationsProps {
  userId: string | null;
  currentChannelId: string | null;
  currentDMChannelId: string | null;
  onNavigate: (channelId: string, isDM: boolean) => void;
  onBadgesRefetch: () => void;
}

const TOAST_DURATION_MS = 5000;

export function ToastNotifications({
  userId,
  currentChannelId,
  currentDMChannelId,
  onNavigate,
  onBadgesRefetch,
}: ToastNotificationsProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const currentChannelRef = useRef(currentChannelId);
  const currentDMRef = useRef(currentDMChannelId);
  currentChannelRef.current = currentChannelId;
  currentDMRef.current = currentDMChannelId;

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    if (!userId) return;
    const topic = `user:${userId}`;
    const manager = getRealtimeManager();
    const unsub = manager.subscribeToBroadcast(
      topic,
      'notification:new',
      (payload: unknown) => {
        const p = payload as NotificationNewPayload;
        const channelId = p?.channelId ?? null;
        const curChannel = currentChannelRef.current;
        const curDM = currentDMRef.current;
        const isDM = !p?.serverId;
        const isInThisChannel = isDM ? curDM === channelId : curChannel === channelId;
        if (isInThisChannel) return;

        const text =
          p?.type === 'mention'
            ? 'Вас упомянули'
            : isDM
              ? 'Новое сообщение в DM'
              : 'Новое сообщение в канале';
        const toast: ToastItem = {
          id: `${p?.id ?? Date.now()}-${Math.random().toString(36).slice(2)}`,
          type: p?.type ?? 'dm',
          channelId,
          serverId: p?.serverId ?? null,
          text,
          createdAt: Date.now(),
        };
        setToasts((prev) => [...prev.slice(-4), toast]);
        onBadgesRefetch();
        setTimeout(() => removeToast(toast.id), TOAST_DURATION_MS);
      }
    );
    return () => unsub();
  }, [userId, onBadgesRefetch, removeToast]);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-toast flex flex-col gap-2 max-w-sm pointer-events-auto"
      role="region"
      aria-label="Уведомления"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => {
            if (t.channelId) {
              onNavigate(t.channelId, !t.serverId);
              onBadgesRefetch();
            }
            removeToast(t.id);
          }}
          className={cn(
            'flex items-center gap-3 px-4 py-3 rounded-lg shadow-elev-2 border border-border-primary',
            'bg-bg-primary text-text-primary text-left',
            'hover:bg-bg-hover transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-primary/40 focus-visible:shadow-focus',
            'animate-in slide-in-from-right-5 fade-in duration-200'
          )}
        >
          <div className="w-10 h-10 rounded-full bg-bg-tertiary flex items-center justify-center text-lg flex-shrink-0">
            🔔
          </div>
          <span className="text-sm font-medium truncate flex-1">{t.text}</span>
        </button>
      ))}
    </div>
  );
}
