import 'server-only';

import { cookies, headers } from 'next/headers';

type AuthUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  globalRole?: 'user' | 'moderator' | 'admin';
};

type ServerSummary = {
  id: string;
  name: string;
  iconUrl: string | null;
  description: string | null;
  ownerId: string;
};

type AuthMeResponse = { user: AuthUser; licenseAccepted?: boolean };
type ServersResponse = { servers: ServerSummary[] };

export type AppBootstrapData = {
  user: AuthUser;
  servers: ServerSummary[];
  licenseAccepted: boolean;
};

async function resolveAppOrigin(): Promise<string> {
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('x-forwarded-host') ?? h.get('host');

  if (host) {
    return `${proto}://${host}`;
  }

  const envAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envAppUrl) {
    return envAppUrl.replace(/\/$/, '');
  }

  return 'http://localhost:3000';
}

async function buildCookieHeader(): Promise<string> {
  const store = await cookies();
  return store
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join('; ');
}

export async function getAppBootstrapData(): Promise<AppBootstrapData | null> {
  const origin = await resolveAppOrigin();
  const cookieHeader = await buildCookieHeader();

  if (!cookieHeader) {
    return null;
  }

  try {
    const authRes = await fetch(`${origin}/api/auth/me`, {
      method: 'GET',
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });

    if (!authRes.ok) {
      console.warn('[Bootstrap] /api/auth/me returned non-OK status', authRes.status);
      return null;
    }

    const rawText = await authRes.text();

    let authJson: AuthMeResponse;
    try {
      authJson = JSON.parse(rawText) as AuthMeResponse;
    } catch (parseError) {
      console.error('[Bootstrap] Failed to parse /api/auth/me response as JSON:', (parseError as Error).message);
      console.error('[Bootstrap] Raw /api/auth/me response (truncated):', rawText.slice(0, 200));
      return null;
    }

    if (!authJson || !authJson.user) {
      console.warn('[Bootstrap] /api/auth/me response does not contain user');
      return null;
    }

    const user = authJson.user;
    const licenseAccepted = authJson.licenseAccepted ?? false;

    let servers: ServerSummary[] = [];
    try {
      const serversRes = await fetch(`${origin}/api/servers`, {
        method: 'GET',
        headers: { cookie: cookieHeader },
        cache: 'no-store',
      });

      if (serversRes.ok) {
        const serversJson = (await serversRes.json()) as ServersResponse;
        servers = Array.isArray(serversJson.servers) ? serversJson.servers : [];
      }
    } catch (serversError) {
      // Non-critical bootstrap fetch. UI can refetch via React Query.
      console.warn('[Bootstrap] Failed to fetch /api/servers during bootstrap:', serversError);
    }

    return { user, servers, licenseAccepted };
  } catch (error) {
    console.error('[Bootstrap] Unexpected error during bootstrap:', error);
    return null;
  }
}
