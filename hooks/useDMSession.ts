'use client';

import { useEffect, useSyncExternalStore, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getDMSession } from '@/lib/dm/DMSession';
import type { DMSessionSnapshot } from '@/lib/dm/DMSession';
import type { DMChannel } from '@/types/dm';

function subscribe(callback: () => void): () => void {
  return getDMSession().subscribe(callback);
}

const emptySnapshot: DMSessionSnapshot = {
  channels: [],
  activeDmId: null,
  callState: 'idle',
  incomingCall: null,
  activeCallDmId: null,
  currentUserId: null,
};

function getServerSnapshot(): DMSessionSnapshot {
  return emptySnapshot;
}

function getClientSnapshot(): DMSessionSnapshot {
  return getDMSession().getSnapshot();
}

/**
 * Single source of truth for DM channels and call state. Messages use Entity Slice (useMessages + GET /api/messages).
 */
export function useDMSession(currentUserId: string | null) {
  const queryClient = useQueryClient();
  const snapshot = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot
  );

  useEffect(() => {
    getDMSession().setCurrentUserId(currentUserId);
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;
    getDMSession().loadChannels();
  }, [currentUserId]);

  const setActiveDm = useCallback((dmId: string | null) => {
    getDMSession().setActiveDm(dmId);
  }, []);

  const createOrGetChannel = useCallback(async (otherUserId: string): Promise<DMChannel> => {
    return getDMSession().createOrGetChannel(otherUserId);
  }, []);

  const startCall = useCallback(async (dmId: string) => {
    await getDMSession().startCall(dmId, queryClient);
  }, [queryClient]);

  const acceptCall = useCallback(async () => {
    await getDMSession().acceptCall(queryClient);
  }, [queryClient]);

  const rejectCall = useCallback(async () => {
    await getDMSession().rejectCall();
  }, []);

  const endCall = useCallback(async () => {
    await getDMSession().endCall();
  }, []);

  const refreshChannels = useCallback(() => {
    getDMSession().loadChannels();
  }, []);

  const refreshChannelsIfNeeded = useCallback((channelId: string) => {
    getDMSession().refreshChannelsIfNeeded(channelId);
  }, []);

  return {
    ...snapshot,
    setActiveDm,
    createOrGetChannel,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    refreshChannels,
    refreshChannelsIfNeeded,
  };
}
