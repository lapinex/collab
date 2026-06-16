'use client';

import { useQuery } from '@tanstack/react-query';
import { vvChannelNameKey } from '@/lib/voice-view/keys';

/**
 * Reads the display name for a voice channel (set when joining).
 */
export function useVoiceChannelName(channelId: string | null): string | null {
  const { data } = useQuery({
    queryKey: channelId ? vvChannelNameKey(channelId) : ['vv:channelName', null],
    enabled: false,
  });

  return (data as string | null | undefined) ?? null;
}
