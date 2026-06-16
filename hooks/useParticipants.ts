'use client';

import { useMemo } from 'react';
import { useLiveVoiceParticipants } from '@/hooks/useLiveVoiceParticipants';
import { useVoicePresenceStore } from '@/stores/voice-presence-store';
import { selectVoiceParticipantsByChannelId } from '@/stores/voice-presence.selectors';

export interface Participant {
  userId: string;
  userName: string;
  joinedAt: string;
  isScreenSharing?: boolean;
  isSpeaking?: boolean;
  isMuted?: boolean;
  isDeafened?: boolean;
  avatarUrl?: string | null;
}

/**
 * Returns voice participants for a channel. Source: VoiceSession + voice presence (mute/deafen state).
 */
export function useParticipants(channelId: string | null) {
  const voiceParticipants = useLiveVoiceParticipants(channelId);
  const voicePresenceSelector = useMemo(() => selectVoiceParticipantsByChannelId(channelId), [channelId]);
  const voicePresence = useVoicePresenceStore(voicePresenceSelector);
  const presenceByUserId = useMemo(
    () => new Map(voicePresence.filter((p) => p.userId).map((p) => [p.userId!, p])),
    [voicePresence]
  );

  const participants: Participant[] = useMemo(
    () =>
      voiceParticipants.map((p) => {
        const uid = p.userId ?? p.id ?? '';
        const presence = uid ? presenceByUserId.get(uid) : undefined;
        return {
          userId: uid,
          userName: p.name,
          joinedAt: new Date().toISOString(),
          isScreenSharing: p.isScreenSharing ?? false,
          isSpeaking: p.isSpeaking ?? false,
          isMuted: presence?.isMuted ?? p.isMuted ?? false,
          isDeafened: presence?.isDeafened ?? false,
          avatarUrl: p.avatarUrl ?? null,
        };
      }),
    [voiceParticipants, presenceByUserId]
  );

  return {
    participants,
    isLoading: false,
    reload: () => {},
  };
}
