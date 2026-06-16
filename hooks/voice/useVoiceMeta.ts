'use client';

import { useQuery } from '@tanstack/react-query';
import { vvMetaKey, type VoiceMetaSlice } from '@/lib/voice-view/keys';
import { patchMeta } from '@/lib/voice-view/patchers';

const defaultMeta: VoiceMetaSlice = {
  canSpeak: true,
  micId: null,
  speakerId: null,
  isMuted: false,
  isDeafened: false,
  isScreenSharing: false,
  screenParticipantSid: null,
};

/**
 * Reads the meta slice for a voice channel. No fetch — cache only.
 */
export function useVoiceMeta(channelId: string | null): VoiceMetaSlice {
  const { data } = useQuery({
    queryKey: channelId ? vvMetaKey(channelId) : ['vv:meta', null],
    enabled: false,
  });

  return patchMeta(data as VoiceMetaSlice | undefined, {}) ?? defaultMeta;
}
