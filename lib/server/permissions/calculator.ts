/**
 * Internal permission calculator. Do not import directly.
 * Use PermissionEngine from lib/permissions/engine/PermissionEngine.ts for all permission checks.
 */
import { db } from '@/lib/server/db/client';
import { userRoles, servers } from '@/lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { Permission } from '@/types/permissions';
import { cacheKeys, TTL, redisGetJSON, redisSetJSON, redisDelByPattern } from '@/lib/server/redis/client';
import { hasPermission } from '@/lib/permissions/constants';
import { getCachedChannelPermissions } from './getCachedChannelPermissions';
import {
  invalidatePermissionCacheByUser,
  invalidatePermissionCacheForServer as invalidatePermissionCacheForServerUtil,
} from './invalidatePermissionCache';
import { getPermVersion } from './permVersion';

export interface CalculatedPermissions {
  allow: number;
  deny: number;
  final: number;
}

export async function calculatePermissions(
  userId: string,
  serverId: string,
  channelId?: string
): Promise<CalculatedPermissions> {
  // Channel: use Redis cache layer (6h TTL, resolve on miss)
  if (channelId) {
    const cached = await getCachedChannelPermissions(userId, serverId, channelId);
    return { allow: cached.allow, deny: cached.deny, final: cached.final };
  }

  // Server-level: versioned key perm:...:v${version}
  const version = await getPermVersion(serverId);
  const cacheKey = cacheKeys.perm(serverId, undefined, userId, version);
  const cached = await redisGetJSON<CalculatedPermissions>(cacheKey);
  if (cached) {
    return cached;
  }

  const server = await db.query.servers.findFirst({
    where: eq(servers.id, serverId),
  });

  if (server?.ownerId === userId) {
    const allPermissions = Permission.ADMINISTRATOR;
    const result: CalculatedPermissions = {
      allow: allPermissions,
      deny: 0,
      final: allPermissions,
    };
    await redisSetJSON(cacheKey, result, TTL.PERMISSIONS);
    return result;
  }

  let allowPermissions = 0;
  let denyPermissions = 0;

  const userRolesList = await db.query.userRoles.findMany({
    where: and(eq(userRoles.userId, userId), eq(userRoles.serverId, serverId)),
    with: { role: true },
  });

  const sortedUserRoles = userRolesList
    .filter((ur) => ur.role)
    .sort((a, b) => (b.role?.position ?? 0) - (a.role?.position ?? 0));

  for (const userRole of sortedUserRoles) {
    const role = userRole.role;
    if (!role) continue;
    const rolePermsNum = typeof role.permissions === 'bigint' ? Number(role.permissions) : role.permissions;

    if (hasPermission(rolePermsNum, Permission.ADMINISTRATOR)) {
      allowPermissions = Permission.ADMINISTRATOR;
      denyPermissions = 0;
      break;
    }
    allowPermissions |= rolePermsNum;
  }

  const finalPermissions = allowPermissions & ~denyPermissions;
  const result: CalculatedPermissions = {
    allow: allowPermissions,
    deny: denyPermissions,
    final: finalPermissions,
  };
  await redisSetJSON(cacheKey, result, TTL.PERMISSIONS);
  return result;
}

export async function checkPermission(
  userId: string,
  serverId: string,
  permission: Permission,
  channelId?: string
): Promise<boolean> {
  const calculated = await calculatePermissions(userId, serverId, channelId);
  return hasPermission(calculated.final, permission);
}

export async function requirePermission(
  userId: string,
  serverId: string,
  permission: Permission,
  channelId?: string
): Promise<void> {
  const hasPerm = await checkPermission(userId, serverId, permission, channelId);

  if (!hasPerm) {
    throw new Error('Insufficient permissions');
  }
}

/** Invalidate permissions cache for a user in a server (e.g. after role change / join). */
export async function invalidatePermissionsCache(
  userId: string,
  serverId: string
): Promise<void> {
  await invalidatePermissionCacheByUser(serverId, userId);
}

/** Invalidate all permission cache keys for a server (roles/overrides/channel changes). */
export async function invalidatePermissionsCacheForServer(
  serverId: string
): Promise<void> {
  try {
    await invalidatePermissionCacheForServerUtil(serverId);
    await redisDelByPattern(cacheKeys.userChannelsPattern(serverId));
    const { invalidateServerMembersCache } = await import('@/lib/server/view-builders/server/members');
    await invalidateServerMembersCache(serverId);
  } catch (err) {
    console.warn('[invalidatePermissionsCacheForServer]', err);
  }
}
