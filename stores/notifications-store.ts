'use client';

import { create } from 'zustand';
import type { NotificationDto } from '@/types/notifications';

export interface NotificationsState {
  /** All notifications in memory (recent first). Deduped by id. */
  items: NotificationDto[];
  unreadCount: number;
  addNotification: (n: NotificationDto) => void;
  setNotifications: (items: NotificationDto[], unreadCount: number) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clear: () => void;
}

export const useNotificationsStore = create<NotificationsState>()((set) => ({
  items: [],
  unreadCount: 0,

  addNotification: (n) =>
    set((state) => {
      const exists = state.items.some((i) => i.id === n.id);
      if (exists) return state;
      const next = [n, ...state.items].slice(0, 200);
      const unreadCount = state.unreadCount + (n.readAt ? 0 : 1);
      return { items: next, unreadCount };
    }),

  setNotifications: (items, unreadCount) => set({ items, unreadCount }),

  markRead: (id) =>
    set((state) => {
      const now = new Date().toISOString();
      const next = state.items.map((i) => (i.id === id ? { ...i, readAt: now } : i));
      const unreadCount = next.filter((i) => !i.readAt).length;
      return { items: next, unreadCount };
    }),

  markAllRead: () =>
    set((state) => {
      const now = new Date().toISOString();
      const next = state.items.map((i) => ({ ...i, readAt: i.readAt ?? now }));
      return { items: next, unreadCount: 0 };
    }),

  clear: () => set({ items: [], unreadCount: 0 }),
}));
