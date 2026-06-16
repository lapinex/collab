import { db, withDbRetry } from '@/lib/server/db/client';
import { channels, channelPermissions, servers, userRoles } from '@/lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { PermissionEngine } from '@/lib/server/permissions/engine/PermissionEngine';

export async function buildChannelView(userId: string, channelId: string) {
  const channel = await withDbRetry(
    () =>
      db.query.channels.findFirst({
        where: eq(channels.id, channelId),
      }),
    'buildChannelView (channel)'
  );

  if (!channel) {
    const err = new Error('Channel not found');
    (err as Error & { status?: number }).status = 404;
    throw err;
  }

  const server = await withDbRetry(
    () =>
      db.query.servers.findFirst({
        where: eq(servers.id, channel.serverId),
      }),
    'buildChannelView (server)'
  );

  if (!server) {
    const err = new Error('Server not found');
    (err as Error & { status?: number }).status = 404;
    throw err;
  }

  const isOwner = server.ownerId === userId;
  const isMember = await withDbRetry(
    () =>
      db.query.userRoles.findFirst({
        where: and(
          eq(userRoles.userId, userId),
          eq(userRoles.serverId, channel.serverId)
        ),
      }),
    'buildChannelView (access)'
  );

  if (!isOwner && !isMember) {
    const err = new Error('Insufficient permissions');
    (err as Error & { status?: number }).status = 403;
    throw err;
  }

  const [permissions, overwrites] = await Promise.all([
    PermissionEngine.getChannelPermissions(userId, channel.serverId, channelId),
    withDbRetry(
      () =>
        db.query.channelPermissions.findMany({
          where: eq(channelPermissions.channelId, channelId),
          with: {
            role: {
              columns: {
                id: true,
                name: true,
                color: true,
                position: true,
              },
            },
            user: {
              columns: {
                id: true,
                name: true,
                avatarUrl: true,
              },
            },
          },
        }),
      'buildChannelView (overwrites)'
    ),
  ]);

  const permissionOverwrites = overwrites.map((ow) => ({
    id: ow.id,
    channelId: ow.channelId,
    roleId: ow.roleId,
    userId: ow.userId,
    allow: typeof ow.allowPermissions === 'bigint' ? Number(ow.allowPermissions) : ow.allowPermissions,
    deny: typeof ow.denyPermissions === 'bigint' ? Number(ow.denyPermissions) : ow.denyPermissions,
    role: ow.role
      ? {
          id: ow.role.id,
          name: ow.role.name,
          color: ow.role.color,
          position: ow.role.position,
        }
      : null,
    user: ow.user
      ? {
          id: ow.user.id,
          name: ow.user.name,
          avatarUrl: ow.user.avatarUrl,
        }
      : null,
  }));

  const currentUserPermissions = permissions.flags;

  return {
    channel,
    permissionOverwrites,
    currentUserPermissions,
  };
}
