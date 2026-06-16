'use client';

import { useEffect, useCallback, useRef } from 'react';
import { usePresenceStore } from '@/stores/presence-store';
import {
  selectCurrentUserId,
  selectGetPresence,
  selectGetStatus,
  selectMergePresence,
  selectPresenceById,
  selectSetCurrentUserId,
  selectSetOffline,
  selectSetOnline,
} from '@/stores/presence.selectors';
import type { PresenceStatus } from '@/components/profile/Avatar';
import { getRealtimeManager } from '@/lib/realtime/RealtimeManager';

const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds — POST /api/presence/heartbeat

/**
 * Presence hook: reads from store (updated by realtime + API).
 * Subscribes to presence:update; fetches /api/presence on mount.
 * UI uses getPresence/getStatus from store — no direct API for others.
 */
export function usePresence() {
  const presenceById = usePresenceStore(selectPresenceById);
  const currentUserId = usePresenceStore(selectCurrentUserId);
  const mergePresence = usePresenceStore(selectMergePresence);
  const setCurrentUserId = usePresenceStore(selectSetCurrentUserId);
  const setOnline = usePresenceStore(selectSetOnline);
  const setOffline = usePresenceStore(selectSetOffline);
  const getPresence = usePresenceStore(selectGetPresence);
  const getStatus = usePresenceStore(selectGetStatus);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Realtime primary: presence:update (status) + USER_PRESENCE_UPDATE (connect/disconnect)
  useEffect(() => {
    const manager = getRealtimeManager();
    const unsubUpdate = manager.subscribeToBroadcast('presence', 'presence:update', (payload: unknown) => {
      const p = payload as { userId?: string; status?: string; lastSeen?: string; customStatus?: string | null; typingChannelId?: string | null; inVoiceChannelId?: string | null; speaking?: boolean };
      if (p?.userId) {
        mergePresence(p.userId, {
          status: p.status as PresenceStatus | undefined,
          lastSeen: p.lastSeen,
          customStatus: p.customStatus,
          typingChannelId: p.typingChannelId,
          inVoiceChannelId: p.inVoiceChannelId,
          speaking: p.speaking,
        });
      }
    });
    const unsubConnect = manager.subscribeToBroadcast('presence', 'USER_PRESENCE_UPDATE', (payload: unknown) => {
      const p = payload as { userId?: string; online?: boolean };
      if (typeof p?.userId === 'string') {
        if (p.online) setOnline(p.userId);
        else setOffline(p.userId);
      }
    });
    return () => {
      unsubUpdate();
      unsubConnect();
    };
  }, [mergePresence, setOnline, setOffline]);

  // Initial fetch (GET) + heartbeat every 30s (POST /api/presence/heartbeat)
  useEffect(() => {
    const fetchPresence = async () => {
      try {
        const res = await fetch('/api/presence', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          const p = data.presence;
          if (p?.userId) {
            setCurrentUserId(p.userId);
            mergePresence(p.userId, {
              userId: p.userId,
              status: p.status,
              lastSeen: typeof p.lastSeen === 'string' ? p.lastSeen : new Date(p.lastSeen).toISOString(),
              customStatus: p.customStatus ?? null,
            });
          }
        }
      } catch (err) {
        console.error('Failed to fetch presence:', err);
      }
    };
    const heartbeat = async () => {
      try {
        const state = usePresenceStore.getState();
        const uid = state.currentUserId;
        const status = uid ? state.getStatus(uid) : 'offline';
        const body = status === 'offline' ? { status: 'online' as const } : { status };
        await fetch('/api/presence/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
      } catch (err) {
        console.error('Failed to send presence heartbeat:', err);
      }
    };
    fetchPresence();
    const interval = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [mergePresence, setCurrentUserId]);

  const updateMyStatus = useCallback(
    async (status: PresenceStatus, customStatus?: string) => {
      try {
        const res = await fetch('/api/presence', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ status, customStatus }),
        });
        if (res.ok && currentUserId) {
          const data = await res.json();
          const p = data.presence;
          if (p) {
            mergePresence(currentUserId, {
              status: p.status,
              lastSeen: p.lastSeen,
              customStatus: p.customStatus ?? null,
            });
          }
        }
        if (status === 'online') {
          if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
          idleTimeoutRef.current = setTimeout(() => {
            updateMyStatus('idle');
          }, IDLE_TIMEOUT);
        } else {
          if (idleTimeoutRef.current) {
            clearTimeout(idleTimeoutRef.current);
            idleTimeoutRef.current = null;
          }
        }
      } catch (err) {
        console.error('Failed to update presence:', err);
      }
    },
    [currentUserId, mergePresence]
  );

  // Idle on inactivity
  useEffect(() => {
    const handleActivity = () => {
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
      const current = getStatus(currentUserId ?? '');
      if (current === 'idle') {
        updateMyStatus('online');
      } else if (current === 'online') {
        idleTimeoutRef.current = setTimeout(() => updateMyStatus('idle'), IDLE_TIMEOUT);
      }
    };
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach((ev) => window.addEventListener(ev, handleActivity, { passive: true }));
    if (currentUserId && getStatus(currentUserId) === 'online') {
      idleTimeoutRef.current = setTimeout(() => updateMyStatus('idle'), IDLE_TIMEOUT);
    }
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handleActivity));
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
    };
  }, [currentUserId, getStatus, updateMyStatus]);

  // Set online once when we have current user
  const hasSetOnlineRef = useRef(false);
  useEffect(() => {
    if (currentUserId && !hasSetOnlineRef.current) {
      hasSetOnlineRef.current = true;
      updateMyStatus('online');
    }
  }, [currentUserId, updateMyStatus]);

  const myStatus = (currentUserId ? getStatus(currentUserId) : 'offline') as PresenceStatus;

  return {
    presenceMap: presenceById,
    getPresence: (userId: string) => {
      const p = getPresence(userId);
      if (!p) return null;
      return {
        userId: p.userId,
        status: p.status as PresenceStatus,
        lastSeen: new Date(p.lastSeen),
        customStatus: p.customStatus ?? undefined,
      };
    },
    getStatus,
    updateMyStatus,
    myStatus,
  };
}
