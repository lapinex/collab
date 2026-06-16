'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore } from '@/stores/app-store';
import {
  selectSetActiveTab,
  selectSetSelectedChannel,
  selectSetSelectedDMChannelId,
} from '@/stores/app.selectors';
import { useNavigationSendOptional } from '@/lib/ui-orchestrator/NavigationMachineContext';
import {
  subscribeToUserNotifications,
  type ToastNotificationPayload,
} from '@/hooks/useToastNotifications';
import { Avatar } from '@/components/profile/Avatar';
import { cn } from '@/lib/utils';
import { playNotifyAudio } from '@/lib/notifications/notifyAudio';
import { AnimatePresence, motion } from 'framer-motion';
import { buildAppUrl } from '@/lib/navigation/appStateUrl';

const MAX_TOASTS = 4;
const TOAST_DURATION_MS = 5000;

interface ToastItem extends Omit<ToastNotificationPayload, 'createdAt'> {
  toastId: string;
  createdAt: number;
}

function getToastTitle(n: Pick<ToastNotificationPayload, 'type' | 'serverId' | 'channelName'>): string {
  const isDM = !n.serverId;
  switch (n.type) {
    case 'mention':
      return n.channelName ? `Вас упомянули в #${n.channelName}` : 'Вас упомянули';
    case 'dm':
      return 'Новое сообщение в DM';
    case 'reply':
      return 'Ответ на ваше сообщение';
    case 'call':
      return 'Входящий звонок';
    default:
      return isDM ? 'Новое сообщение в DM' : 'Новое сообщение в канале';
  }
}

function truncatePreview(preview: string | null | undefined, maxLen: number): string {
  if (!preview || typeof preview !== 'string') return '';
  const t = preview.replace(/\s+/g, ' ').trim();
  return t.length <= maxLen ? t : t.slice(0, maxLen) + '…';
}

async function markChannelRead(channelId: string, serverId?: string | null): Promise<void> {
  try {
    await fetch('/api/notifications/mark-channel-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ channelId, serverId: serverId ?? undefined }),
    });
  } catch (e) {
    console.error('[ToastOverlay] mark-channel-read failed:', e);
  }
}

export function ToastOverlay() {
  const router = useRouter();
  const { user } = useAuth();
  const send = useNavigationSendOptional();
  const setActiveTab = useAppStore(selectSetActiveTab);
  const setSelectedChannel = useAppStore(selectSetSelectedChannel);
  const setSelectedDMChannelId = useAppStore(selectSetSelectedDMChannelId);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const hoverRef = useRef<Set<string>>(new Set());

  const removeToast = useCallback((toastId: string) => {
    timersRef.current.delete(toastId);
    hoverRef.current.delete(toastId);
    setToasts((prev) => prev.filter((t) => t.toastId !== toastId));
  }, []);

  const scheduleHide = useCallback(
    (toastId: string) => {
      timersRef.current.delete(toastId);
      const id = setTimeout(() => {
        timersRef.current.delete(toastId);
        removeToast(toastId);
      }, TOAST_DURATION_MS);
      timersRef.current.set(toastId, id);
    },
    [removeToast]
  );

  const pushToast = useCallback((notification: ToastNotificationPayload) => {
    // UX-only: premium, short click sound on toast show.
    void playNotifyAudio();
    const toastId = `${notification.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const item: ToastItem = { ...notification, toastId, createdAt: Date.now() };
    setToasts((prev) => {
      const next = [...prev, item].slice(-MAX_TOASTS);
      return next;
    });
    scheduleHide(toastId);
  }, [scheduleHide]);

  useEffect(() => {
    if (!user?.id) return;
    return subscribeToUserNotifications(user.id, pushToast);
  }, [user?.id, pushToast]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
    };
  }, []);

  const handleToastClick = useCallback(
    (t: ToastItem) => {
      if (!t.channelId) {
        removeToast(t.toastId);
        return;
      }
      const isDM = !t.serverId;
      if (send) {
        if (isDM) send({ type: 'DM_SELECTED', dmId: t.channelId });
        else send({ type: 'CHANNEL_SELECTED', channelId: t.channelId, serverId: t.serverId ?? undefined });
      } else {
        if (isDM) {
          setActiveTab('dms');
          setSelectedDMChannelId(t.channelId);
        } else {
          setActiveTab('servers');
          setSelectedChannel(t.channelId);
        }
      }
      router.push(
        buildAppUrl(
          isDM
            ? { tab: 'dms', dmId: t.channelId }
            : { tab: 'servers', serverId: t.serverId ?? null, channelId: t.channelId }
        )
      );
      markChannelRead(t.channelId, t.serverId);
      removeToast(t.toastId);
    },
    [
      removeToast,
      send,
      setActiveTab,
      setSelectedChannel,
      setSelectedDMChannelId,
      router,
    ]
  );

  const handleMouseEnter = useCallback((toastId: string) => {
    hoverRef.current.add(toastId);
    const id = timersRef.current.get(toastId);
    if (id) {
      clearTimeout(id);
      timersRef.current.delete(toastId);
    }
  }, []);

  const handleMouseLeave = useCallback(
    (toastId: string) => {
      hoverRef.current.delete(toastId);
      scheduleHide(toastId);
    },
    [scheduleHide]
  );

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-toast flex flex-col gap-2 w-[360px] max-w-[calc(100vw-24px)] pointer-events-none"
      style={{ pointerEvents: 'none' }}
    >
      <motion.div
        layout
        className="flex flex-col gap-2 pointer-events-auto"
        role="region"
        aria-label="Уведомления"
      >
        <AnimatePresence mode="popLayout">
          {toasts.map((t) => (
            <motion.div
              key={t.toastId}
              layout
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.2 }}
            >
              <ToastCard
                toast={t}
                onClick={() => handleToastClick(t)}
                onMouseEnter={() => handleMouseEnter(t.toastId)}
                onMouseLeave={() => handleMouseLeave(t.toastId)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

interface ToastCardProps {
  toast: ToastItem;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function ToastCard({ toast, onClick, onMouseEnter, onMouseLeave }: ToastCardProps) {
  const title = getToastTitle(toast);
  const preview = truncatePreview(toast.messagePreview, 80);
  const username = toast.author?.username ?? 'Кто-то';

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        'w-full flex items-start gap-3 p-3 rounded-lg text-left',
        'bg-bg-primary border border-border-primary shadow-elev-2',
        'hover:bg-bg-hover transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-primary/40 focus-visible:shadow-focus'
      )}
    >
      <div className="flex-shrink-0 mt-0.5">
        <Avatar
          src={toast.author?.avatar ?? null}
          name={username}
          size="md"
          showStatus={false}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-text-primary truncate">{username}</div>
        <div className="text-sm text-green-primary truncate">{title}</div>
        {preview && (
          <div className="text-sm text-text-muted truncate mt-0.5">{preview}</div>
        )}
      </div>
    </button>
  );
}
