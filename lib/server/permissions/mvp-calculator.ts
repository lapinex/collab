// MVP: Simplified permissions calculator using MVP roles
// NOTE: This now uses the bit-flag permission system for actual checks
import { db, withDbRetry } from '@/lib/server/db/client';
import { servers, userRoles, users } from '@/lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { TTL } from '@/lib/server/redis/client';
import { redis } from '@/lib/server/redis/client';
import { MVPRole, MVP_ROLE_PERMISSIONS } from './mvp-roles';
import { PermissionEngine } from './engine/PermissionEngine';
import { Permission } from '@/types/permissions';

export type GlobalRole = 'user' | 'moderator' | 'admin';

export interface MVPPermissionCheck {
  userId: string;
  serverId: string;
  permission: keyof typeof MVP_ROLE_PERMISSIONS[MVPRole];
}

export async function getGlobalRole(userId: string): Promise<GlobalRole> {
  // Check cache first
  const cacheKey = `global_role:${userId}`;
  const cached = await redis.get<GlobalRole>(cacheKey);

  if (cached) {
    return cached;
  }

  // Get user's global role from database
  const user = await withDbRetry(
    () =>
      db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: {
          globalRole: true,
        },
      }),
    'getGlobalRole'
  );

  const role = (user?.globalRole || 'user') as GlobalRole;
  await redis.setex(cacheKey, TTL.PERMISSIONS, role);

  return role;
}

export async function getUserMVPRole(
  userId: string,
  serverId: string
): Promise<string | null> {
  // Check cache first
  const cacheKey = `mvp_role:${userId}:${serverId}`;
  const cached = await redis.get<MVPRole>(cacheKey);

  if (cached) {
    return cached;
  }

  // Check if user is server owner (owner role)
  const server = await withDbRetry(
    () =>
      db.query.servers.findFirst({
        where: eq(servers.id, serverId),
      }),
    'getUserMVPRole (server)'
  );

  if (server?.ownerId === userId) {
    // Server owner is automatically 'owner' role
    await redis.setex(cacheKey, TTL.PERMISSIONS, 'owner');
    return 'owner';
  }

  // Get user role from user_roles table
  const userRoleRecord = await withDbRetry(
    () =>
      db.query.userRoles.findFirst({
        where: and(
          eq(userRoles.userId, userId),
          eq(userRoles.serverId, serverId)
        ),
        with: {
          role: true,
        },
      }),
    'getUserMVPRole (userRole)'
  );

  if (!userRoleRecord) {
    // User is not a member of the server - no role assigned
    // Cache null result to avoid repeated DB queries
    await redis.setex(cacheKey, TTL.PERMISSIONS, '');
    return null;
  }

  const role = userRoleRecord.role;
  if (!role || Array.isArray(role)) {
    return null;
  }
  const roleName = (role as { name: string }).name;
  
  // Map role names: 'owner' or 'admin' -> 'owner', 'member' or 'user' -> 'member'
  let mappedRole: string;
  if (roleName === 'owner' || roleName === 'admin' || roleName === MVPRole.ADMIN) {
    mappedRole = 'owner';
  } else if (roleName === 'member' || roleName === 'user' || roleName === MVPRole.USER) {
    mappedRole = 'member';
  } else {
    // Keep other roles as-is (e.g., 'moderator')
    mappedRole = roleName;
  }
  
  await redis.setex(cacheKey, TTL.PERMISSIONS, mappedRole);

  return mappedRole;
}

// Map MVP permission names to bit-flag Permission enum
const MVP_TO_BIT_PERMISSION_MAP: Record<keyof typeof MVP_ROLE_PERMISSIONS[MVPRole], Permission> = {
  canViewChannel: Permission.VIEW_CHANNEL,
  canSendMessages: Permission.SEND_MESSAGES,
  canManageMessages: Permission.MANAGE_MESSAGES,
  canManageChannels: Permission.MANAGE_CHANNELS,
  canManageServer: Permission.MANAGE_SERVER,
  canManageMembers: Permission.MANAGE_MEMBERS,
  canKickMembers: Permission.KICK_MEMBERS,
  canBanMembers: Permission.BAN_MEMBERS,
  canConnectVoice: Permission.CONNECT,
  canSpeakVoice: Permission.SPEAK,
};

export async function checkMVPPermission(
  userId: string,
  serverId: string,
  permission: keyof typeof MVP_ROLE_PERMISSIONS[MVPRole],
  channelId?: string
): Promise<boolean> {
  // Map MVP permission to bit-flag permission
  const bitPermission = MVP_TO_BIT_PERMISSION_MAP[permission];
  
  if (!bitPermission) {
    console.warn(`[checkMVPPermission] Unknown MVP permission: ${permission}`);
    // Fallback to old system for unknown permissions
    const serverRole = await getUserMVPRole(userId, serverId);
    if (!serverRole) return false;
    
    let mvpRole: MVPRole;
    if (serverRole === 'owner' || serverRole === MVPRole.ADMIN) {
      mvpRole = MVPRole.ADMIN;
    } else if (serverRole === 'member' || serverRole === MVPRole.USER || serverRole === 'user') {
      mvpRole = MVPRole.USER;
    } else if (serverRole === 'moderator' || serverRole === MVPRole.MODERATOR) {
      mvpRole = MVPRole.MODERATOR;
    } else {
      mvpRole = serverRole as MVPRole;
    }
    
    if (!(mvpRole in MVP_ROLE_PERMISSIONS)) {
      return false;
    }
    
    return MVP_ROLE_PERMISSIONS[mvpRole][permission];
  }

  // Use the new bit-flag permission system
  // This ensures that permissions set in role settings are actually enforced
  const hasBitPermission = await PermissionEngine.canByBit(userId, serverId, bitPermission, channelId);
  console.log(`[checkMVPPermission] User ${userId}, Server ${serverId}, Permission ${permission} (${bitPermission}): ${hasBitPermission}`);
  return hasBitPermission;
}

export async function requireMVPPermission(
  userId: string,
  serverId: string,
  permission: keyof typeof MVP_ROLE_PERMISSIONS[MVPRole],
  channelId?: string
): Promise<void> {
  const hasPermission = await checkMVPPermission(userId, serverId, permission, channelId);

  if (!hasPermission) {
    throw new Error('Insufficient permissions');
  }
}

export async function invalidateMVPRoleCache(
  userId: string,
  serverId?: string
): Promise<void> {
  if (serverId) {
    await redis.del(`mvp_role:${userId}:${serverId}`);
  }
  // Always invalidate global role cache when server role changes
  await redis.del(`global_role:${userId}`);
}
