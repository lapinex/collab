/**
 * Task 3: Initialize LiveKit cleanup on server start
 * This runs once when the server starts to clear all voice rooms
 */

import { clientEnv } from '@/lib/env/clientEnv';

let cleanupInitialized = false;

function normalizeBaseUrl(raw: string | undefined): string {
  const value = (raw ?? '').trim();
  if (!value) return 'http://localhost:3000';
  if (/^https?:\/\//i.test(value)) return value.replace(/\/$/, '');
  if (value.startsWith('//')) return `https:${value}`.replace(/\/$/, '');
  return `https://${value}`.replace(/\/$/, '');
}

export async function initLivekitCleanup() {
  if (cleanupInitialized) {
    return;
  }

  cleanupInitialized = true;

  try {
    const baseUrl = normalizeBaseUrl(clientEnv.appUrl);
    const response = await fetch(`${baseUrl}/api/livekit/cleanup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      console.log('[LiveKit Init] Cleanup completed:', data);
    } else {
      console.warn('[LiveKit Init] Cleanup failed:', await response.text());
    }
  } catch (error) {
    // Silently fail - this is not critical
    console.warn('[LiveKit Init] Cleanup error (non-critical):', error);
  }
}

if (typeof window === 'undefined') {
  const isBuildPhase = clientEnv.nextPhase === 'phase-production-build';
  const cleanupEnabled = clientEnv.nodeEnv === 'development';
  if (!isBuildPhase && cleanupEnabled) {
    initLivekitCleanup().catch(() => {
      // Ignore errors
    });
  }
}
