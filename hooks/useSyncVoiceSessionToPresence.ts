'use client';

import { useEffect } from 'react';
import { useVoiceSession } from '@/lib/voice-session/useVoiceSession';
import { useVoicePresenceStore, type VoicePresenceParticipant } from '@/stores/voice-presence-store';
import { selectMergeChannelPresence } from '@/stores/voice-presence.selectors';
import type { VoiceParticipant } from '@/lib/voice-view/keys';

function mapVoiceParticipantToPresence(p: VoiceParticipant): VoicePresenceParticipant {
  return {
    sid: p.sid,
    identity: p.id,
    userId: p.userId ?? null,
    name: p.name,
    avatarUrl: p.avatarUrl ?? null,
    isMuted: p.isMuted,
    isDeafened: (p as { isDeafened?: boolean }).isDeafened ?? false,
    isSpeaking: p.isSpeaking,
    isScreenSharing: p.isScreenSharing ?? false,
  };
}

/**
 * When user is IN a voice channel, syncs VoiceSession participants to VoicePresenceStore.
 * UI never reads VoiceSession directly — it reads from the store.
 */
export function useSyncVoiceSessionToPresence(): void {
  const snapshot = useVoiceSession();
  const mergeChannelPresence = useVoicePresenceStore(selectMergeChannelPresence);
  const { channelId, participants: participantsMap, order } = snapshot;

  useEffect(() => {
    if (!channelId) return;
    const participants: VoiceParticipant[] = order
      .map((id) => participantsMap[id])
      .filter((p): p is VoiceParticipant => p != null);
    const presence: VoicePresenceParticipant[] = participants.map(mapVoiceParticipantToPresence);
    mergeChannelPresence(channelId, presence);
  }, [channelId, mergeChannelPresence, order, participantsMap]);
}
