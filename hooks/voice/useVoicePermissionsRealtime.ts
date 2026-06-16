'use client';

/**
 * TODO: Implement voice:canSpeak realtime producer on backend.
 * No backend publishes to realtime:voice:permissions:${channelId} yet.
 * When moderator revokes speak permission, API should publish { canSpeak, channelId }.
 * See: docs/archive/VOICE_ONE_SPEAKER_ANALYSIS.md
 */
export function useVoicePermissionsRealtime(_channelId: string | null) {
  // No-op until backend producer exists
}
