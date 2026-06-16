'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { PresenceEntityState } from '@/stores/types';

/** Single presence state for one user (from API / realtime). */
export interface UserPresenceState {
  userId: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  lastSeen: string;
  customStatus?: string | null;
  typingChannelId?: string | null;
  inVoiceChannelId?: string | null;
  speaking?: boolean;
}

type PresenceStatus = UserPresenceState['status'];

const ONLINE_STATUSES: ReadonlySet<PresenceStatus> = new Set(['online', 'idle', 'dnd']);

function addOnlineId(ids: string[], userId: string): string[] {
  return ids.includes(userId) ? ids : [...ids, userId];
}

function removeOnlineId(ids: string[], userId: string): string[] {
  if (!ids.includes(userId)) {
    return ids;
  }
  return ids.filter((id) => id !== userId);
}

/** Don't overwrite with polling if we received realtime in last N ms. */
const RECONCILE_STALE_MS = 45_000;

interface PresenceState {
  presence: PresenceEntityState<UserPresenceState>;
  /** Timestamp of last realtime update (mergePresence/setOnline/setOffline). Used to avoid overwriting with stale polling. */
  lastRealtimeUpdateAt: number;
  currentUserId: string | null;

  setOnline: (userId: string) => void;
  setOffline: (userId: string) => void;
  setOnlineUserIds: (ids: string[]) => void;
  /** Reconciliation fallback: apply polling result only when no recent realtime (avoids overwriting fresh data). */
  reconcileOnlineUserIds: (ids: string[]) => void;
  isOnline: (userId: string) => boolean;
  getOnlineUserIds: () => Set<string>;

  /** Merge presence update from API or realtime (presence:update). */
  mergePresence: (userId: string, partial: Partial<UserPresenceState>) => void;
  setCurrentUserId: (userId: string | null) => void;
  getPresence: (userId: string) => UserPresenceState | null;
  getStatus: (userId: string) => UserPresenceState['status'];
  /** User IDs currently typing in a channel (derived from presenceMap). */
  getTypingUserIds: (channelId: string) => string[];
}

export const usePresenceStore = create<PresenceState>()(
  devtools(
    (set, get) => ({
      presence: {
        byId: {},
        onlineIds: [],
        lastUpdated: {},
      },
      lastRealtimeUpdateAt: 0,
      currentUserId: null,

      setOnline: (userId) =>
        set(
          (state) => ({
            presence: {
              ...state.presence,
              onlineIds: addOnlineId(state.presence.onlineIds, userId),
              lastUpdated: {
                ...state.presence.lastUpdated,
                [userId]: Date.now(),
              },
            },
            lastRealtimeUpdateAt: Date.now(),
          }),
          false,
          'presence/setOnline'
        ),

      setOffline: (userId) =>
        set(
          (state) => ({
            presence: {
              ...state.presence,
              onlineIds: removeOnlineId(state.presence.onlineIds, userId),
              lastUpdated: {
                ...state.presence.lastUpdated,
                [userId]: Date.now(),
              },
            },
            lastRealtimeUpdateAt: Date.now(),
          }),
          false,
          'presence/setOffline'
        ),

      setOnlineUserIds: (ids) =>
        set(
          (state) => ({
            presence: {
              ...state.presence,
              onlineIds: Array.from(new Set(ids)),
            },
          }),
          false,
          'presence/setOnlineUserIds'
        ),

      reconcileOnlineUserIds: (ids) =>
        set(
          (state) => {
            const now = Date.now();
            const hasRecentRealtime = now - state.lastRealtimeUpdateAt < RECONCILE_STALE_MS;
            const needsBootstrap = state.presence.onlineIds.length === 0;
            if (hasRecentRealtime && !needsBootstrap) return state;
            return {
              presence: {
                ...state.presence,
                onlineIds: Array.from(new Set(ids)),
              },
            };
          },
          false,
          'presence/reconcileOnlineUserIds'
        ),

      isOnline: (userId) => get().presence.onlineIds.includes(userId),

      getOnlineUserIds: () => new Set(get().presence.onlineIds),

      mergePresence: (userId, partial) =>
        set(
          (state) => {
            const prev = state.presence.byId[userId];
            const next: UserPresenceState = {
              userId,
              status: partial.status ?? prev?.status ?? 'offline',
              lastSeen: partial.lastSeen ?? prev?.lastSeen ?? new Date(0).toISOString(),
              customStatus: partial.customStatus !== undefined ? partial.customStatus : prev?.customStatus ?? null,
              typingChannelId:
                partial.typingChannelId !== undefined ? partial.typingChannelId : prev?.typingChannelId,
              inVoiceChannelId:
                partial.inVoiceChannelId !== undefined ? partial.inVoiceChannelId : prev?.inVoiceChannelId,
              speaking: partial.speaking !== undefined ? partial.speaking : prev?.speaking,
            };
            const onlineIds = ONLINE_STATUSES.has(next.status)
              ? addOnlineId(state.presence.onlineIds, userId)
              : removeOnlineId(state.presence.onlineIds, userId);
            return {
              presence: {
                byId: {
                  ...state.presence.byId,
                  [userId]: next,
                },
                onlineIds,
                lastUpdated: {
                  ...state.presence.lastUpdated,
                  [userId]: Date.now(),
                },
              },
              lastRealtimeUpdateAt: Date.now(),
            };
          },
          false,
          'presence/mergePresence'
        ),

      setCurrentUserId: (userId) =>
        set(
          {
            currentUserId: userId,
          },
          false,
          'presence/setCurrentUserId'
        ),

      getPresence: (userId) => get().presence.byId[userId] ?? null,

      getStatus: (userId) => get().presence.byId[userId]?.status ?? 'offline',

      getTypingUserIds: (channelId) =>
        Object.entries(get().presence.byId)
          .filter(([, p]) => p.typingChannelId === channelId)
          .map(([uid]) => uid),
    }),
    {
      name: 'presence-store',
      enabled: process.env.NODE_ENV === 'development',
    }
  )
);
