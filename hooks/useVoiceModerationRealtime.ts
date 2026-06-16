'use client';

import { useEffect } from 'react';
import { getRealtimeManager } from '@/lib/realtime/RealtimeManager';
import { useVoicePresenceStore } from '@/stores/voice-presence-store';
import { selectApplyModeration } from '@/stores/voice-presence.selectors';

/**
 * Subscribes to channel:{channelId} participant_moderated when user is in that voice channel.
 * Updates voice presence store so ParticipantList shows muted/deafened state.
 */
export function useVoiceModerationRealtime(voiceChannelId: string | null): void {
  const applyModeration = useVoicePresenceStore(selectApplyModeration);

  useEffect(() => {
    if (!voiceChannelId) return;

    const topic = `channel:${voiceChannelId}`;
    const manager = getRealtimeManager();
    const unsub = manager.subscribeToBroadcast(topic, 'participant_moderated', (payload: unknown) => {
      const p = payload as { userId?: string; targetUserId?: string; muted?: boolean; deafened?: boolean };
      const userId = p?.userId ?? p?.targetUserId;
      if (userId != null && (p.muted !== undefined || p.deafened !== undefined)) {
        applyModeration(voiceChannelId, userId, { muted: p.muted, deafened: p.deafened });
      }
    });
    return unsub;
  }, [voiceChannelId, applyModeration]);
}
