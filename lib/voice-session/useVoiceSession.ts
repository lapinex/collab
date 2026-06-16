'use client';

import { useState, useEffect } from 'react';
import { getVoiceRuntime } from '@/lib/voice-runtime/voiceRuntime';
import type { VoiceSessionSnapshot } from './VoiceSession';

const DEFAULT_SNAPSHOT: VoiceSessionSnapshot = {
  channelId: null,
  state: 'idle',
  connectionState: 'disconnected',
  participants: {},
  order: [],
  speaking: [],
  channelName: null,
  meta: {
    canSpeak: true,
    micId: null,
    speakerId: null,
    isMuted: false,
    isDeafened: false,
    isScreenSharing: false,
    screenParticipantSid: null,
  },
};

/**
 * Subscribes to VoiceSession (from runtime, outside React) and returns the current snapshot.
 * UI depends only on VoiceSession; no vv:* or React Query for voice.
 */
export function useVoiceSession(): VoiceSessionSnapshot {
  const [snapshot, setSnapshot] = useState<VoiceSessionSnapshot>(() => {
    try {
      if (typeof window === 'undefined') return DEFAULT_SNAPSHOT;
      return getVoiceRuntime().voiceSession.getSnapshot();
    } catch {
      return DEFAULT_SNAPSHOT;
    }
  });

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      return getVoiceRuntime().voiceSession.subscribe(setSnapshot);
    } catch {
      return undefined;
    }
  }, []);

  return snapshot;
}
