'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { getRealtimeManager } from '@/lib/realtime/RealtimeManager';
import { cn } from '@/lib/utils';
import { getNotificationUrl } from '@/lib/notifications/resolveNotificationTarget';
import type { NotificationDto } from '@/types/notifications';

export interface UnreadNotification {
  id: string;
  type: string;
  userId?: string;
  messageId: string | null;
  channelId: string | null;
  serverId: string | null;
  dmId?: string | null;
  readAt: string | null;
  createdAt: string;
  payload?: Record<string, unknown> | null;
}

interface NotificationBellProps {
  unreadCount: number;
  notifications: UnreadNotification[];
  onRefresh: () => void;
  onNavigate: (channelId: string, isDM: boolean, serverId?: string | null) => void;
  className?: string;
}

const PANEL_WIDTH = 320;
const GAP = 8;
const NOTIFICATION_PANEL_STORAGE_KEY = 'collab:notifications:panel-open';

function formatNotificationTime(createdAt: string): string {
  try {
    const d = new Date(createdAt);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffM = Math.floor(diffMs / 60000);
    if (diffM < 1) return 'только что';
    if (diffM < 60) return `${diffM} мин`;
    const diffH = Math.floor(diffM / 60);
    if (diffH < 24) return `${diffH} ч`;
    const diffD = Math.floor(diffH / 24);
    return `${diffD} д`;
  } catch {
    return '';
  }
}

function getNotificationCardTitle(n: UnreadNotification): string {
  const payload = n.payload as Record<string, unknown> | undefined;
  const isDM = !n.serverId || !!n.dmId;
  switch (n.type) {
    case 'mention:channel':
    case 'mention':
      return payload?.channelName ? `Вас упомянули в #${String(payload.channelName)}` : (isDM ? 'Вас упомянули в DM' : 'Вас упомянули в канале');
    case 'reply':
      return 'Ответ на ваше сообщение';
    case 'message:dm':
    case 'dm':
      return payload?.authorName ? `${String(payload.authorName)} написал(а) вам` : 'Новое сообщение в DM';
    case 'call:incoming:dm':
    case 'call':
      return payload?.callerName ? `Входящий звонок от ${String(payload.callerName)}` : 'Входящий звонок';
    case 'friend:request':
      return payload?.fromUserName ? `Запрос в друзья от ${String(payload.fromUserName)}` : 'Запрос в друзья';
    case 'friend:accepted':
      return payload?.userName ? `${String(payload.userName)} принял(а) запрос` : 'Запрос в друзья принят';
    case 'server:invite':
      return payload?.serverName ? `Приглашение: ${String(payload.serverName)}` : 'Приглашение на сервер';
    default:
      return isDM ? 'Новое сообщение в DM' : 'Уведомление';
  }
}

export function NotificationBell({
  unreadCount,
  notifications,
  onRefresh,
  onNavigate,
  className,
}: NotificationBellProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [panelStyle, setPanelStyle] = useState<{ bottom: number; left: number; maxHeight: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const showPortal = open || exiting;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(NOTIFICATION_PANEL_STORAGE_KEY);
    if (saved === '1') {
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(NOTIFICATION_PANEL_STORAGE_KEY, open ? '1' : '0');
  }, [open]);

  const handleNotificationClick = useCallback(
    async (n: UnreadNotification) => {
      const dmIdRaw = n.dmId ?? (n.payload as Record<string, unknown>)?.dmId;
      const channelIdRaw = n.channelId ?? (n.payload as Record<string, unknown>)?.channelId;
      const channelId = typeof channelIdRaw === 'string' ? channelIdRaw : undefined;
      const dmId = typeof dmIdRaw === 'string' ? dmIdRaw : undefined;
      const isDM = !n.serverId || !!dmId;
      const targetChannelId = channelId ?? dmId;
      if (targetChannelId) {
        onNavigate(targetChannelId, !!isDM, n.serverId);
      }
      setOpen(false);
      const url = getNotificationUrl(n as NotificationDto);
      router.push(url);
      if (channelId) {
        try {
          await fetch('/api/notifications/mark-channel-read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ channelId, serverId: n.serverId ?? undefined }),
          });
        } catch (e) {
          console.error('[NotificationBell] mark-channel-read failed:', e);
        }
      }
      if (!n.readAt) {
        try {
          await fetch(`/api/notifications/${n.id}/read`, {
            method: 'PATCH',
            credentials: 'include',
          });
        } catch (e) {
          console.error('[NotificationBell] mark read failed:', e);
        }
      }
      onRefresh();
    },
    [onNavigate, onRefresh, router]
  );

  const updatePosition = useCallback(() => {
    if (typeof document === 'undefined' || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    // Низ панели вплотную над кнопкой: привязка по bottom viewport, чтобы не «уезжало» вверх
    const gapAboveButtons = 6;
    const bottomFromViewport = window.innerHeight - rect.bottom + gapAboveButtons;
    const panelHeight = Math.min(360, Math.max(200, rect.bottom - 24));
    let left = rect.left + rect.width / 2 - PANEL_WIDTH / 2;
    if (left < GAP) left = GAP;
    if (left + PANEL_WIDTH > vw - GAP) left = vw - PANEL_WIDTH - GAP;
    setPanelStyle({ bottom: bottomFromViewport, left, maxHeight: panelHeight });
  }, []);

  useEffect(() => {
    if (!open && !exiting) {
      setPanelStyle(null);
      return;
    }
    if (open) setExiting(false);
    if (!open) {
      setExiting(true);
      return;
    }
    const run = () => updatePosition();
    run();
    const raf = requestAnimationFrame(run); // ещё раз после layout (кнопка уже внизу)
    const onResize = () => updatePosition();
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [open, exiting, updatePosition]);

  return (
    <div className={cn('relative', className)}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) {
            onRefresh();
            setExiting(false);
          }
        }}
        className="p-2 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-primary"
        title="Уведомления"
        aria-label={unreadCount > 0 ? `Уведомления (${unreadCount})` : 'Уведомления'}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        <span
          className={cn(
            'absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-[#ED4245] origin-center',
            unreadCount > 0 ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
          )}
          style={{ transition: 'transform 180ms ease, opacity 180ms ease' }}
          aria-hidden
        />
      </button>
      {showPortal && typeof document !== 'undefined' && createPortal(
        <AnimatePresence onExitComplete={() => { setExiting(false); setPanelStyle(null); }}>
          {open && panelStyle && (
            <>
              <motion.div
                key="backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="fixed inset-0 z-[100] backdrop-blur-sm bg-black/20"
                aria-hidden
                onClick={() => { setOpen(false); setExiting(true); }}
              />
              <motion.div
                key="panel"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="fixed w-80 overflow-auto rounded-lg border border-border-primary bg-bg-primary/95 backdrop-blur-md shadow-2xl z-[101] py-2"
                role="dialog"
                aria-label="Панель уведомлений"
                style={{ bottom: panelStyle.bottom, left: panelStyle.left, width: PANEL_WIDTH, maxHeight: panelStyle.maxHeight }}
              >
                <div className="px-3 py-2 border-b border-border-primary flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-text-primary">Уведомления</h3>
                  {notifications.length > 0 && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await fetch('/api/notifications/read-all', { method: 'POST', credentials: 'include' });
                          onRefresh();
                        } catch (e) {
                          console.error('[NotificationBell] read-all failed:', e);
                        }
                      }}
                      className="text-xs text-green-primary hover:underline"
                    >
                      Прочитать все
                    </button>
                  )}
                </div>
                {notifications.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-text-muted">
                    Нет непрочитанных
                  </div>
                ) : (
                  <NotificationPanelList notifications={notifications.slice(0, 20)} onNotificationClick={handleNotificationClick} />
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

function useNotificationGroups(notifications: UnreadNotification[]): { label: string; items: UnreadNotification[] }[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const sorted = [...notifications].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const groups: { label: string; items: UnreadNotification[] }[] = [];
  const today: UnreadNotification[] = [];
  const yesterday: UnreadNotification[] = [];
  const older: UnreadNotification[] = [];
  for (const n of sorted) {
    const t = new Date(n.createdAt).getTime();
    if (t >= startOfToday) today.push(n);
    else if (t >= startOfYesterday) yesterday.push(n);
    else older.push(n);
  }
  if (today.length) groups.push({ label: 'Сегодня', items: today });
  if (yesterday.length) groups.push({ label: 'Вчера', items: yesterday });
  if (older.length) groups.push({ label: 'Ранее', items: older });
  return groups;
}

function NotificationPanelList({
  notifications,
  onNotificationClick,
}: {
  notifications: UnreadNotification[];
  onNotificationClick: (n: UnreadNotification) => void;
}) {
  const groups = useNotificationGroups(notifications);
  return (
    <>
      {groups.map(({ label, items }) => (
        <div key={label} className="mb-2">
          <div className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
            {label}
          </div>
          <ul className="py-0.5">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => onNotificationClick(n)}
                  className={cn(
                    'w-full px-3 py-2.5 text-left hover:bg-bg-hover transition-colors flex items-start gap-3',
                    !n.readAt && 'bg-bg-tertiary/80'
                  )}
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-bg-quaternary flex items-center justify-center text-lg">
                    {n.type === 'mention:channel' || n.type === 'mention' ? '📢' : n.type === 'message:dm' || n.type === 'dm' ? '💬' : n.type === 'call:incoming:dm' || n.type === 'call' ? '📞' : n.type === 'friend:request' || n.type === 'friend:accepted' ? '👋' : n.type === 'server:invite' ? '📨' : '↩️'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text-primary truncate">
                      {getNotificationCardTitle(n)}
                    </div>
                    <div className="text-xs text-text-muted mt-0.5">
                      {n.channelId ? (n.serverId ? 'Канал' : 'DM') : '—'}
                    </div>
                    <div className="text-xs text-text-muted mt-1">
                      {formatNotificationTime(n.createdAt)}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

/** Fetches unread list; subscribes to notification:new to increment badge without refetch. */
export function useUnreadNotifications(userId: string | null) {
  const [data, setData] = useState<{
    notifications: UnreadNotification[];
    unreadCount: number;
  }>({ notifications: [], unreadCount: 0 });

  const fetchUnread = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/unread', { credentials: 'include' });
      if (!res.ok) return;
      const json = await res.json();
      setData({
        notifications: json.notifications ?? [],
        unreadCount: Number(json.unreadCount ?? 0),
      });
    } catch {
      setData((prev) => prev);
    }
  }, []);

  useEffect(() => {
    fetchUnread();
  }, [fetchUnread]);

  useEffect(() => {
    if (!userId) return;
    const manager = getRealtimeManager();
    const unsub = manager.subscribeToBroadcast(
      `user:${userId}`,
      'notification:new',
      () => {
        setData((prev) => ({ ...prev, unreadCount: prev.unreadCount + 1 }));
      }
    );
    return unsub;
  }, [userId]);

  return { ...data, fetchUnread };
}
