'use client';

import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getVoiceRuntime } from '@/lib/voice-runtime/voiceRuntime';
import { getWarmToken } from '@/lib/voice-view/tokenWarmup';

function nextJoinId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `join-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Returns join(channelId, channelName?, serverId?) — uses warm token, then roomController.connect.
 * Channel name is passed to VoiceSession via roomController; UI does not use vv:*.
 */
export function useVoiceJoin() {
  const queryClient = useQueryClient();
  const currentJoinIdRef = useRef<string | null>(null);

  const join = useCallback(
    async (
      channelId: string,
      channelName?: string | null,
      _serverId?: string | null
    ): Promise<void> => {
      const joinId = nextJoinId();
      currentJoinIdRef.current = joinId;

      const tokenData = await getWarmToken(channelId);
      if (currentJoinIdRef.current !== joinId) return;

      await getVoiceRuntime().roomController.connect(
        tokenData.url,
        tokenData.token,
        channelId,
        tokenData.serverId,
        tokenData.canSpeak,
        queryClient,
        channelName ?? null
      );
      if (currentJoinIdRef.current !== joinId) return;
    },
    [queryClient]
  );

  return join;
}
