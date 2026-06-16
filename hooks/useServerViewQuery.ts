'use client';

import type { QueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import {
  svMetaKey,
  svChannelsKey,
  svMembersKey,
  svEmojisKey,
  svWebhooksKey,
} from '@/lib/query-keys/serverViewKeys';
import type {
  Server,
  Role,
  Channel,
  ServerEmoji,
  ServerSticker,
  Webhook,
} from '@/types/server';
import type { PermissionFlags } from '@/types/permissions';

export interface ServerViewMember {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  nickname: string | null;
  roles: Array<{ id: string; name: string; color: string; position: number }>;
  isOwner: boolean;
}

export interface ServerViewData {
  server: Server | null;
  roles: Role[];
  channels: Channel[];
  members: ServerViewMember[];
  emojis: ServerEmoji[];
  stickers: ServerSticker[];
  webhooks: Webhook[];
  currentUserPermissions?: PermissionFlags;
  error?: string;
}

export function serverViewQueryKey(serverId: string | null) {
  return ['serverView', serverId] as const;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: string }).error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

interface ServerViewApiResponse {
  server: Server;
  channels: Channel[];
  roles: Role[];
  emojis: ServerEmoji[];
  stickers: ServerSticker[];
  webhooks: Webhook[];
  membersPreview: Array<{
    id: string;
    userId: string;
    name: string;
    nickname: string | null;
    roles: Array<{ id: string; name: string; color: string; position: number }>;
    avatar: string | null;
    isOwner: boolean;
  }>;
  currentUserPermissions: PermissionFlags;
}

export async function fetchServerView(serverId: string): Promise<ServerViewData> {
  const data = await fetchJson<ServerViewApiResponse>(
    `/api/servers/${serverId}/view`
  );
  const members: ServerViewMember[] = (data.membersPreview ?? []).map(
    ({ avatar, ...m }) => ({
      ...m,
      avatarUrl: avatar,
      email: '',
    })
  );
  return {
    server: data.server ?? null,
    channels: data.channels ?? [],
    roles: data.roles ?? [],
    members,
    emojis: data.emojis ?? [],
    stickers: data.stickers ?? [],
    webhooks: data.webhooks ?? [],
    currentUserPermissions: data.currentUserPermissions,
  };
}

/**
 * Refetch server view and write to slice caches so useServerMeta, useServerChannels, etc. update.
 * Call after mutations (roles, channels, invites, etc.) so UI shows fresh data without page reload.
 */
export async function refetchServerViewSlices(
  queryClient: QueryClient,
  serverId: string
): Promise<void> {
  const data = await fetchServerView(serverId);
  queryClient.setQueryData(svMetaKey(serverId), {
    server: data.server,
    roles: data.roles,
    stickers: data.stickers,
    currentUserPermissions: data.currentUserPermissions,
  });
  queryClient.setQueryData(svChannelsKey(serverId), data.channels);
  queryClient.setQueryData(svMembersKey(serverId), data.members);
  queryClient.setQueryData(svEmojisKey(serverId), data.emojis);
  queryClient.setQueryData(svWebhooksKey(serverId), data.webhooks);
}

/**
 * Schedule refetch after current task so click handler returns quickly (better INP).
 */
export function scheduleRefetchServerViewSlices(
  queryClient: QueryClient,
  serverId: string
): void {
  setTimeout(() => {
    refetchServerViewSlices(queryClient, serverId).catch((err) =>
      console.error('[refetchServerViewSlices]', err)
    );
  }, 0);
}

/**
 * Server "view" query: single GET /api/servers/[serverId]/view.
 * Returns server, channels, roles, members, emojis, stickers, webhooks, currentUserPermissions.
 */
export function useServerViewQuery(serverId: string | null) {
  return useQuery({
    queryKey: serverViewQueryKey(serverId),
    queryFn: () => fetchServerView(serverId!),
    enabled: !!serverId,
  });
}
