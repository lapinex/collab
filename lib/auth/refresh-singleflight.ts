'use client';

import { clearAccessToken, setAccessToken } from './access-token';

let refreshInFlight: Promise<string | null> | null = null;

async function runRefresh(): Promise<string | null> {
  try {
    const refreshRes = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    if (!refreshRes.ok) {
      clearAccessToken();
      return null;
    }

    const refreshJson = (await refreshRes.json()) as { accessToken?: string };
    const token = typeof refreshJson.accessToken === 'string' ? refreshJson.accessToken : null;
    setAccessToken(token);
    return token;
  } catch {
    clearAccessToken();
    return null;
  }
}

export async function refreshAccessTokenSingleFlight(): Promise<string | null> {
  if (refreshInFlight) {
    return refreshInFlight;
  }
  refreshInFlight = runRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

