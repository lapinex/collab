import { db, withDbRetry } from '@/lib/server/db/client';
import { roles } from '@/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { Permission } from '@/types/permissions';
import { MVPRole } from '@/lib/server/permissions/mvp-roles';

export async function buildRolesPart(serverId: string) {
  const rolesList = await withDbRetry(
    () =>
      db.query.roles.findMany({
        where: eq(roles.serverId, serverId),
        orderBy: (roles, { desc }) => [desc(roles.position)],
      }),
    'buildRolesPart'
  );

  const rolesWithFallback = rolesList.map((role) => {
    const currentPerms =
      typeof role.permissions === 'bigint' ? Number(role.permissions) : role.permissions;
    if (currentPerms === 0) {
      if (role.name === MVPRole.USER || role.name === 'user') {
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
        return { ...role, permissions: userPerms };
      }
      if (role.name === MVPRole.MODERATOR || role.name === 'moderator') {
        const modPerms =
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
        return { ...role, permissions: modPerms };
      }
    }
    return role;
  });

  return rolesWithFallback.map((role) => ({
    ...role,
    permissions:
      typeof role.permissions === 'bigint' ? Number(role.permissions) : role.permissions,
  }));
}
