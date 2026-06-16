'use client';

import { useMemo } from 'react';
import { useVoiceSession } from '@/lib/voice-session/useVoiceSession';
import type { VoiceParticipant } from '@/lib/voice-view/keys';

/**
 * Returns voice participants for the current channel from VoiceSession snapshot only.
 * Source of truth: Room → VoiceSession (rebuildVoiceParticipantsFromRoom on every RoomEvent).
 * UI does not hold a local list — it is a direct reflection of Room via VoiceSession.
 */
export function useLiveVoiceParticipants(channelId: string | null): VoiceParticipant[] {
  const snapshot = useVoiceSession();
  const { channelId: currentChannelId, order, participants } = snapshot;

  return useMemo(() => {
    if (!channelId || channelId !== currentChannelId) return [];
    return order.map((id) => participants[id]).filter((p): p is VoiceParticipant => p != null);
  }, [channelId, currentChannelId, order, participants]);
}
