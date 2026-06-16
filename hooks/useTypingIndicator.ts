'use client';

import { useCallback, useRef, useEffect } from 'react';
import { getRealtimeManager } from '@/lib/realtime/RealtimeManager';
import type { ActivityType } from '@/types/activity';

const TYPING_SEND_INTERVAL_MS = 3000;
const TYPING_IDLE_STOP_MS = 3000;

export function useTypingIndicator(channelId: string | null) {
  const lastSentRef = useRef<number>(0);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendActivity = useCallback(
    (activityType: ActivityType, action: 'start' | 'stop') => {
      if (!channelId) return;
      getRealtimeManager().sendUserFrame('activity', { action, channelId, activityType });
    },
    [channelId]
  );

  const startTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastSentRef.current < TYPING_SEND_INTERVAL_MS) {
      if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = setTimeout(() => {
        sendActivity('typing', 'stop');
        stopTimeoutRef.current = null;
      }, TYPING_IDLE_STOP_MS);
      return;
    }
    lastSentRef.current = now;
    sendActivity('typing', 'start');

    if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    stopTimeoutRef.current = setTimeout(() => {
      sendActivity('typing', 'stop');
      stopTimeoutRef.current = null;
    }, TYPING_IDLE_STOP_MS);
  }, [sendActivity]);

  const stopTyping = useCallback(() => {
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    sendActivity('typing', 'stop');
    lastSentRef.current = 0;
  }, [sendActivity]);

  const startUploading = useCallback(
    (type: 'image' | 'video' | 'file') => {
      sendActivity(`uploading:${type}` as ActivityType, 'start');
    },
    [sendActivity]
  );

  const stopUploading = useCallback(
    (type: 'image' | 'video' | 'file') => {
      sendActivity(`uploading:${type}` as ActivityType, 'stop');
    },
    [sendActivity]
  );

  useEffect(() => {
    return () => {
      stopTyping();
    };
  }, [stopTyping]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) stopTyping();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [stopTyping]);

  return {
    startTyping,
    stopTyping,
    startUploading,
    stopUploading,
  };
}
