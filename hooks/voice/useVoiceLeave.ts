'use client';

import { useCallback } from 'react';
import { getVoiceRuntime } from '@/lib/voice-runtime/voiceRuntime';

/**
 * Returns leave() — runtime.roomController.disconnect. Cleans slices and disconnects room.
 */
export function useVoiceLeave() {
  const leave = useCallback(async (): Promise<void> => {
    await getVoiceRuntime().roomController.disconnect();
  }, []);

  return leave;
}
