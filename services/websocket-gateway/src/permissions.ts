import { and, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '@collab/lib/db/schema';
import { servers, userRoles } from '@collab/lib/db/schema';
import { MVP_ROLE_PERMISSIONS, MVPRole, type MVPRolePermissions } from '@collab/lib/permissions/mvp-roles';

export async function checkMVPPermissionNoCache(
  db: PostgresJsDatabase<typeof schema>,
  userId: string,
  serverId: string,
  permission: keyof MVPRolePermissions
): Promise<boolean> {
  // Server owner is ADMIN
  const server = await db.query.servers.findFirst({
    where: eq(servers.id, serverId),
    columns: { ownerId: true },
  });
  if (server?.ownerId === userId) {
    return MVP_ROLE_PERMISSIONS[MVPRole.ADMIN][permission];
  }

  // Membership/role lookup (no Redis cache in gateway)
  const record = await db.query.userRoles.findFirst({
    where: and(eq(userRoles.userId, userId), eq(userRoles.serverId, serverId)),
    with: {
      role: {
        columns: { name: true },
      },
    },
  });

  if (!record || !record.role || Array.isArray(record.role)) {
    return false;
  }

  const roleName = record.role.name;
  const mappedRole =
    roleName === 'owner' || roleName === 'admin'
      ? MVPRole.ADMIN
      : roleName === 'moderator'
        ? MVPRole.MODERATOR
        : MVPRole.USER;

  return MVP_ROLE_PERMISSIONS[mappedRole][permission];
}

