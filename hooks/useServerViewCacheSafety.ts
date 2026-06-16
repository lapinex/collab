'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateServerViewSlices } from '@/lib/query-keys/serverViewKeys';

const NO_EVENT_INVALIDATE_MS = 60_000;
const PERIODIC_INVALIDATE_MS = 5 * 60 * 1000;

/**
 * Safety-net for serverView cache: invalidate on long inactivity or periodically.
 * Uses RealtimeManager singleton; no direct socket subscriptions.
 */
export function useServerViewCacheSafety(serverId: string | null) {
  const queryClient = useQueryClient();
  const noEventTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const periodicIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!serverId) return;
    const sid = serverId;

    function invalidateSlices() {
      invalidateServerViewSlices(queryClient, sid);
    }

    // TODO: Re-enable when backend publishes server_view_event to realtime:serverView:${serverId}
    // const manager = getRealtimeManager();
    // const unsubscribe = manager.subscribeToBroadcast(`serverView:${sid}`, 'server_view_event', ...);

    noEventTimeoutRef.current = setTimeout(() => {
      noEventTimeoutRef.current = null;
      invalidateSlices();
    }, NO_EVENT_INVALIDATE_MS);

    periodicIntervalRef.current = setInterval(() => {
      invalidateSlices();
    }, PERIODIC_INVALIDATE_MS);

    return () => {
      if (noEventTimeoutRef.current) {
        clearTimeout(noEventTimeoutRef.current);
        noEventTimeoutRef.current = null;
      }
      if (periodicIntervalRef.current) {
        clearInterval(periodicIntervalRef.current);
        periodicIntervalRef.current = null;
      }
    };
  }, [serverId, queryClient]);
}
