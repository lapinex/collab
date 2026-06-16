import { PermissionEngine } from '@/lib/server/permissions/engine/PermissionEngine';

export async function buildPermissionsPart(userId: string, serverId: string) {
  const permissions = await PermissionEngine.getServerPermissions(userId, serverId);
  return {
    calculated: { allow: permissions.allow, deny: permissions.deny, final: permissions.final },
    currentUserPermissions: permissions.flags,
  };
}
