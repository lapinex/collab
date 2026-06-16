/**
 * Broadcast Channel Hook — uses RealtimeManager only.
 * Does NOT create raw socket subscriptions in components. Callbacks are registered with the singleton;
 * channels are never closed on unmount.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { getRealtimeManager } from '@/lib/realtime/RealtimeManager';

interface UseBroadcastChannelOptions {
  channelName: string;
  event: string;
  onMessage?: (payload: Record<string, unknown>) => void;
  enabled?: boolean;
}

export function useBroadcastChannel({
  channelName,
  event,
  onMessage,
  enabled = true,
}: UseBroadcastChannelOptions) {
  const [isConnected] = useState(true);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!enabled || !channelName) return;

    const manager = getRealtimeManager();
    const unsubscribe = manager.subscribeToBroadcast(channelName, event, (payload) => {
      const cb = onMessageRef.current;
      if (cb && payload && typeof payload === 'object') {
        cb(payload as Record<string, unknown>);
      }
    });

    return unsubscribe;
  }, [channelName, event, enabled]);

  return {
    isConnected,
    channel: null,
    error: null,
  };
}
