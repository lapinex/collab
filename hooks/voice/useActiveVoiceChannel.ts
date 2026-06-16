'use client';

import { useQuery } from '@tanstack/react-query';
import { vvActiveChannelKey } from '@/lib/voice-view/keys';

/**
 * Reads the active voice channel id (global slice). Set on connect, cleared on disconnect.
 */
export function useActiveVoiceChannel(): string | null {
  const { data } = useQuery({
    queryKey: vvActiveChannelKey(),
    enabled: false,
  });

  return (data as string | null | undefined) ?? null;
}
