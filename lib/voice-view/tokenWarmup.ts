/**
 * Token warmup: cache LiveKit token in memory for 30–60s so Join doesn't wait on API.
 * Valid if Date.now() < expiresAt - 5s (refresh 5s before expiry).
 */

import { getClientInstanceId } from '@/lib/client-instance';

const CACHE_VALIDITY_MS = 55_000;
const REFRESH_BEFORE_MS = 5_000;

export interface TokenData {
  token: string;
  url: string;
  channelId: string;
  serverId: string | null;
  canSpeak: boolean;
  expiresAt: number;
}

const cache = new Map<string, TokenData>();

function isValid(entry: TokenData): boolean {
  return Date.now() < entry.expiresAt - REFRESH_BEFORE_MS;
}

function isForChannel(entry: TokenData, channelId: string): boolean {
  return entry.channelId === channelId;
}

/**
 * Fetch token from API and cache it.
 */
async function fetchAndCache(channelId: string): Promise<TokenData> {
  const clientInstanceId = getClientInstanceId();
  const response = await fetch('/api/livekit/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-client-instance-id': clientInstanceId,
    },
    credentials: 'include',
    body: JSON.stringify({ channelId }),
  });

  if (!response.ok) {
    throw new Error('Failed to get LiveKit token');
  }

  const { token, url, serverId, canSpeak } = await response.json();
  const expiresAt = Date.now() + CACHE_VALIDITY_MS;
  const data: TokenData = {
    token,
    url,
    channelId,
    serverId: serverId ?? null,
    canSpeak: canSpeak !== false,
    expiresAt,
  };
  cache.set(channelId, data);
  return data;
}

/**
 * Warm token for channel: return cached if valid, else fetch and cache.
 * Call on mouse enter over voice channel or when server/channel list loads.
 */
export async function warmupToken(channelId: string): Promise<TokenData> {
  const cached = cache.get(channelId);
  if (cached && isValid(cached) && isForChannel(cached, channelId)) {
    return cached;
  }
  return fetchAndCache(channelId);
}

/**
 * Get token for join: same as warmupToken. Join uses this so it doesn't wait on API.
 */
export async function getWarmToken(channelId: string): Promise<TokenData> {
  return warmupToken(channelId);
}
