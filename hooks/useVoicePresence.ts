'use client';

import { useEffect, useCallback, useMemo } from 'react';
import { useVoicePresenceStore, type VoicePresenceParticipant } from '@/stores/voice-presence-store';
import {
  selectSetChannelPresence,
  selectVoiceParticipantsByChannelId,
} from '@/stores/voice-presence.selectors';
import { useVoiceConnection } from '@/contexts/VoiceConnectionManager';
import { apiGet } from '@/lib/api-client';

interface ApiParticipant {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  joinedAt: string;
}

function mapApiToPresence(api: ApiParticipant[]): VoicePresenceParticipant[] {
  return api.map((p) => ({
    sid: p.userId,
    identity: p.userId,
    userId: p.userId,
    name: p.userName,
    avatarUrl: p.avatarUrl ?? null,
    isMuted: false,
    isDeafened: false,
    isSpeaking: false,
    isScreenSharing: false,
  }));
}

/**
 * Returns voice presence for a channel. UI reads ONLY from this (via store).
 * Fetches from GET /api/voice/participants when not in channel; when in channel
 * presence is synced from VoiceSession (see useSyncVoiceSessionToPresence).
 */
export function useVoicePresence(channelId: string | null): {
  participants: VoicePresenceParticipant[];
  isLoading: boolean;
  reload: () => Promise<void>;
} {
  const currentChannelId = useVoiceConnection().currentChannelId;
  const participantsSelector = useMemo(() => selectVoiceParticipantsByChannelId(channelId), [channelId]);
  const participants = useVoicePresenceStore(participantsSelector);
  const setChannelPresence = useVoicePresenceStore(selectSetChannelPresence);

  const reload = useCallback(async () => {
    if (!channelId) return;
    try {
      const data = await apiGet<{ participants: ApiParticipant[] }>(
        `/api/voice/participants?channelId=${channelId}`
      );
      const list = data.participants ?? [];
      setChannelPresence(channelId, mapApiToPresence(list));
    } catch (e) {
      console.error('[useVoicePresence] Failed to load', e);
      setChannelPresence(channelId, []);
    }
  }, [channelId, setChannelPresence]);

  useEffect(() => {
    if (!channelId) return;
    if (channelId === currentChannelId) return;
    void reload();
  }, [channelId, currentChannelId]); // when not in this channel, fetch from API; sync handles current channel

  return {
    participants,
    isLoading: false,
    reload,
  };
}
