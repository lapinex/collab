'use client';

import { useQuery } from '@tanstack/react-query';
import { vvRoomKey, type VoiceRoomSlice, type VoiceConnectionState } from '@/lib/voice-view/keys';

/**
 * Reads the room slice for a voice channel. No fetch — cache only.
 * Source of truth: patched by roomController on connect/events/disconnect.
 */
export function useVoiceRoom(channelId: string | null) {
  const { data } = useQuery({
    queryKey: channelId ? vvRoomKey(channelId) : ['vv:room', null],
    enabled: false,
  });

  const slice = data as VoiceRoomSlice | undefined;
  const connectionState: VoiceConnectionState = slice?.connectionState ?? 'disconnected';

  return {
    connectionState,
    isConnected: connectionState === 'connected',
    isConnecting: connectionState === 'connecting',
  };
}
