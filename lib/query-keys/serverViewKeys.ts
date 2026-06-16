import type { QueryClient } from '@tanstack/react-query';

export const svMetaKey = (serverId: string) => ['sv:meta', serverId] as const;
export const svChannelsKey = (serverId: string) => ['sv:channels', serverId] as const;
export const svMembersKey = (serverId: string) => ['sv:members', serverId] as const;
export const svEmojisKey = (serverId: string) => ['sv:emojis', serverId] as const;
export const svWebhooksKey = (serverId: string) => ['sv:webhooks', serverId] as const;

/** Invalidate only slice caches + channels list so UI updates in real time. */
export function invalidateServerViewSlices(
  queryClient: QueryClient,
  serverId: string
): void {
  queryClient.invalidateQueries({ queryKey: svMetaKey(serverId) });
  queryClient.invalidateQueries({ queryKey: svChannelsKey(serverId) });
  queryClient.invalidateQueries({ queryKey: svMembersKey(serverId) });
  queryClient.invalidateQueries({ queryKey: svEmojisKey(serverId) });
  queryClient.invalidateQueries({ queryKey: svWebhooksKey(serverId) });
  queryClient.invalidateQueries({ queryKey: ['channels', serverId] });
}

/** Remove slice caches (e.g. on server leave/delete). */
export function removeServerViewSlices(
  queryClient: QueryClient,
  serverId: string
): void {
  queryClient.removeQueries({ queryKey: svMetaKey(serverId) });
  queryClient.removeQueries({ queryKey: svChannelsKey(serverId) });
  queryClient.removeQueries({ queryKey: svMembersKey(serverId) });
  queryClient.removeQueries({ queryKey: svEmojisKey(serverId) });
  queryClient.removeQueries({ queryKey: svWebhooksKey(serverId) });
}
