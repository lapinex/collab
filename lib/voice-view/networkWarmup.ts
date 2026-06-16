/**
 * Network warmup: pre-fetch token so first join doesn't wait on API.
 * Room is a singleton (0.18.13); WebRTC/signaling warmup happens on first real connect.
 */

import { clientEnv } from '@/lib/env/clientEnv';
import { getWarmToken } from './tokenWarmup';

let warmed = false;
let hasRealConnect = false;

/** Called by roomController.connect() so warmup never runs alongside real join. */
export function markRealConnect(): void {
  hasRealConnect = true;
}

/**
 * Warm token cache for channel. Run once per session (e.g. on first voice channel hover).
 * Skipped if a real connect has already been done. No Room creation — singleton only in roomController.
 */
export async function warmupLiveKitNetwork(channelId: string): Promise<void> {
  if (hasRealConnect || warmed) return;
  warmed = true;

  try {
    await getWarmToken(channelId);
  } catch (err) {
    warmed = false;
    if (clientEnv.nodeEnv === 'development') {
      console.warn('[VoiceView] Network warmup (token) failed:', err);
    }
  }
}
