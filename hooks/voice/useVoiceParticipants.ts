'use client';

import { useQuery } from '@tanstack/react-query';
import {
  vvParticipantsKey,
  vvOrderKey,
  type VoiceParticipant,
  type ParticipantsSlice,
  type OrderSlice,
} from '@/lib/voice-view/keys';

/**
 * Reads participants for a voice channel from slices. No fetch — cache only.
 * Returns array in display order (order slice).
 */
export function useVoiceParticipants(channelId: string | null): VoiceParticipant[] {
  const { data: participants } = useQuery({
    queryKey: channelId ? vvParticipantsKey(channelId) : ['vv:participants', null],
    enabled: false,
  });
  const { data: order } = useQuery({
    queryKey: channelId ? vvOrderKey(channelId) : ['vv:order', null],
    enabled: false,
  });

  const entities = (participants ?? {}) as ParticipantsSlice;
  const orderList = (order ?? []) as OrderSlice;

  return orderList
    .map((key) => entities[key])
    .filter((p): p is VoiceParticipant => p != null);
}
