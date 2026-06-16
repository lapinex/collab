'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { selectIsAuthenticated } from '@/stores/auth.selectors';
import { apiGet } from '@/lib/api-client';
import type { Server } from '@/types/server';
import { serversListQueryKey } from '@/lib/messages/keys';

const QUERY_KEY = serversListQueryKey();

async function fetchServers(): Promise<{ servers: Server[]; hasMore?: boolean; nextCursor?: string | null }> {
  const query = new URLSearchParams({
    limit: '100',
  });
  return apiGet<{ servers: Server[]; hasMore?: boolean; nextCursor?: string | null }>(`/api/servers?${query.toString()}`);
}

/**
 * TanStack Query hook for server list.
 * Uses existing GET /api/servers. Parallel to Zustand — no store logic removed.
 */
export function useServersQuery() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchServers,
    enabled: !!isAuthenticated,
    staleTime: 60_000,
  });
}
