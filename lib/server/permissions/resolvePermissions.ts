/**
 * Pure permission resolution — no cache.
 * Used by getCachedChannelPermissions; do not call from client.
 */
import { db } from '@/lib/server/db/client';
import { userRoles, channelPermissions, servers, roles, channels } from '@/lib/server/db/schema';
import { eq, and, or } from 'drizzle-orm';
import { Permission } from '@/types/permissions';
import { hasPermission } from '@/lib/permissions/constants';
import { convertToOverwrite, type ChannelPermissionOverwrite } from './calculateChannelPermissions';
import { calculateFinalPermissions } from './calculateFinalPermissions';
import type { Role } from '@/types/server';

export interface ChannelPermissionsResult {
  allow: number;
  deny: number;
  final: number;
}

export interface ResolveChannelPermissionsParams {
  userId: string;
  serverId: string;
  channelId: string;
}

/**
 * Resolve channel permissions from DB (roles, overwrites, owner).
 * No Redis — use getCachedChannelPermissions for cached access.
 */
export async function resolveChannelPermissions({
  userId,
  serverId,
  channelId,
}: ResolveChannelPermissionsParams): Promise<ChannelPermissionsResult> {
  const server = await db.query.servers.findFirst({
    where: eq(servers.id, serverId),
  });

  if (server?.ownerId === userId) {
    const all = Permission.ADMINISTRATOR;
    return { allow: all, deny: 0, final: all };
  }

  const everyoneRole = await db.query.roles.findFirst({
    where: and(
      eq(roles.serverId, serverId),
      or(eq(roles.position, 0), eq(roles.name, '@everyone'))
    ),
  });
  let allowPermissions = everyoneRole
    ? (typeof everyoneRole.permissions === 'bigint'
        ? Number(everyoneRole.permissions)
        : everyoneRole.permissions)
    : 0;
  let denyPermissions = 0;

  const userRolesList = await db.query.userRoles.findMany({
    where: and(eq(userRoles.userId, userId), eq(userRoles.serverId, serverId)),
    with: { role: true },
  });

  const sortedUserRoles = userRolesList
    .filter((ur) => ur.role && ur.role.id !== everyoneRole?.id)
    .sort((a, b) => (b.role?.position ?? 0) - (a.role?.position ?? 0));

  for (const userRole of sortedUserRoles) {
    const role = userRole.role;
    if (!role) continue;
    const rolePermsNum =
      typeof role.permissions === 'bigint' ? Number(role.permissions) : role.permissions;

    if (
      hasPermission(rolePermsNum, Permission.ADMINISTRATOR) ||
      role.name === 'admin' ||
      role.name === 'Admin'
    ) {
      allowPermissions = Permission.ADMINISTRATOR;
      denyPermissions = 0;
      break;
    }

    if (rolePermsNum === 0) {
      const roleNameLower = role.name.toLowerCase();
      if (roleNameLower === 'user' || roleNameLower === 'member') {
        const userPerms =
          Permission.VIEW_SERVER |
          Permission.VIEW_CHANNEL |
          Permission.SEND_MESSAGES |
          Permission.READ_MESSAGE_HISTORY |
          Permission.ADD_REACTIONS |
          Permission.ATTACH_FILES |
          Permission.EMBED_LINKS |
          Permission.USE_EXTERNAL_EMOJIS |
          Permission.CONNECT |
          Permission.SPEAK |
          Permission.USE_VOICE_ACTIVATION;
        allowPermissions |= userPerms;
        continue;
      }
      if (roleNameLower === 'moderator') {
        const moderatorPerms =
          Permission.VIEW_SERVER |
          Permission.VIEW_CHANNEL |
          Permission.SEND_MESSAGES |
          Permission.READ_MESSAGE_HISTORY |
          Permission.MANAGE_MESSAGES |
          Permission.ADD_REACTIONS |
          Permission.ATTACH_FILES |
          Permission.EMBED_LINKS |
          Permission.KICK_MEMBERS |
          Permission.CONNECT |
          Permission.SPEAK |
          Permission.USE_VOICE_ACTIVATION;
        allowPermissions |= moderatorPerms;
        continue;
      }
    }
    allowPermissions |= rolePermsNum;
  }

  const channel = await db.query.channels.findFirst({
    where: eq(channels.id, channelId),
  });
  const everyoneRoleForOverwrites = await db.query.roles.findFirst({
    where: and(
      eq(roles.serverId, serverId),
      or(eq(roles.position, 0), eq(roles.name, '@everyone'))
    ),
  });
  const everyoneRoleId = everyoneRoleForOverwrites?.id;

  let categoryOverwrites: ChannelPermissionOverwrite[] = [];
  if (channel?.parentId) {
    const categoryOverrides = await db.query.channelPermissions.findMany({
      where: eq(channelPermissions.channelId, channel.parentId),
    });
    categoryOverwrites = categoryOverrides.map((cp) =>
      convertToOverwrite({
        ...cp,
        allowPermissions: BigInt(cp.allowPermissions),
        denyPermissions: BigInt(cp.denyPermissions),
      })
    );
  }

  const channelOverrides = await db.query.channelPermissions.findMany({
    where: eq(channelPermissions.channelId, channelId),
  });
  const channelOverwrites: ChannelPermissionOverwrite[] = channelOverrides.map((cp) =>
    convertToOverwrite({
      ...cp,
      allowPermissions: BigInt(cp.allowPermissions),
      denyPermissions: BigInt(cp.denyPermissions),
    })
  );

  const userRolesArray: Role[] = sortedUserRoles
    .map((ur) => {
      const role = ur.role;
      if (!role) return null;
      return {
        id: role.id,
        serverId: role.serverId,
        name: role.name,
        color: role.color,
        position: role.position,
        permissions: BigInt(
          typeof role.permissions === 'bigint' ? Number(role.permissions) : role.permissions
        ),
        createdAt: role.createdAt,
        updatedAt: role.updatedAt,
      };
    })
    .filter((r): r is Role => r !== null);

  const effectivePermissions = calculateFinalPermissions({
    memberRoles: userRolesArray,
    baseRolePermissions: allowPermissions,
    categoryOverwrites,
    channelOverwrites,
    userId,
    everyoneRoleId,
  });

  allowPermissions = effectivePermissions;
  denyPermissions = 0;
  const finalPermissions = allowPermissions & ~denyPermissions;

  return {
    allow: allowPermissions,
    deny: denyPermissions,
    final: finalPermissions,
  };
}
