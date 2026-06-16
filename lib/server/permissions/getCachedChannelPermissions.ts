/**
 * Channel permissions with Redis cache. Versioned key: perm:...:v${version}.
 * TTL 6 hours; invalidation = INCR server:permVersion (no mass delete).
 */
import { cacheKeys, TTL, redisGetJSON, redisSetJSON } from '@/lib/server/redis/client';
import { getPermVersion } from './permVersion';
import { resolveChannelPermissions } from './resolvePermissions';
import { flagsFromFinal } from '@/lib/permissions/constants';
import type { PermissionFlags } from '@/types/permissions';

export interface CachedChannelPermissionsResult {
  allow: number;
  deny: number;
  final: number;
  flags: PermissionFlags;
}

/**
 * Get channel permissions: read from Redis (versioned key); on miss resolve, cache, return.
 */
export async function getCachedChannelPermissions(
  userId: string,
  serverId: string,
  channelId: string
): Promise<CachedChannelPermissionsResult> {
  const version = await getPermVersion(serverId);
  const key = cacheKeys.perm(serverId, channelId, userId, version);
  const cached = await redisGetJSON<{ allow: number; deny: number; final: number }>(key);

  if (cached) {
    return {
      ...cached,
      flags: flagsFromFinal(cached.final),
    };
  }

  const resolved = await resolveChannelPermissions({ userId, serverId, channelId });
  await redisSetJSON(key, resolved, TTL.PERMISSIONS_CHANNEL);

  return {
    ...resolved,
    flags: flagsFromFinal(resolved.final),
  };
}
