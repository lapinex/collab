import type { Role } from '@/types/server';
import type { ChannelPermission } from '@/types/server';
import { Permission } from '@/types/permissions';
import { hasPermission } from '@/lib/permissions/constants';

export interface ChannelPermissionOverwrite {
  id: string;
  channelId: string;
  roleId: string | null;
  userId: string | null;
  allow: number;
  deny: number;
}

export interface CalculateChannelPermissionsParams {
  memberRoles: Role[];
  baseRolePermissions: number; // Combined permissions from all roles
  channelOverwrites: ChannelPermissionOverwrite[];
  userId: string;
  everyoneRoleId?: string; // ID of @everyone role
}

/**
 * Calculate effective permissions for a channel following Discord's algorithm:
 * 1. Start with base permissions from roles
 * 2. Apply @everyone role overwrite
 * 3. Apply role overwrites (sorted by position DESC)
 * 4. Apply user-specific overwrite
 * 
 * Formula: permissions = base & ~deny | allow
 */
export function calculateChannelPermissions({
  memberRoles,
  baseRolePermissions,
  channelOverwrites,
  userId,
  everyoneRoleId,
}: CalculateChannelPermissionsParams): number {
  // Start with base permissions
  let permissions = baseRolePermissions;

  // If user has ADMINISTRATOR permission, grant all permissions
  if (hasPermission(permissions, Permission.ADMINISTRATOR)) {
    return Permission.ADMINISTRATOR;
  }

  // Separate overwrites by type
  const everyoneOverwrite = everyoneRoleId
    ? channelOverwrites.find(ow => ow.roleId === everyoneRoleId)
    : null;
  
  const roleOverwrites = channelOverwrites
    .filter(ow => ow.roleId && ow.roleId !== everyoneRoleId)
    .map(ow => {
      const role = memberRoles.find(r => r.id === ow.roleId);
      return { overwrite: ow, role, position: role?.position ?? 0 };
    })
    .filter(item => item.role) // Only include overwrites for roles the user has
    .sort((a, b) => b.position - a.position); // Sort by position DESC (higher first)

  const userOverwrite = channelOverwrites.find(ow => ow.userId === userId);

  // Step 1: Apply @everyone role overwrite
  if (everyoneOverwrite) {
    // Formula: permissions = (permissions & ~deny) | allow
    permissions = (permissions & ~everyoneOverwrite.deny) | everyoneOverwrite.allow;
  }

  // Step 2: Apply role overwrites (in order of position DESC)
  for (const { overwrite } of roleOverwrites) {
    // Formula: permissions = (permissions & ~deny) | allow
    permissions = (permissions & ~overwrite.deny) | overwrite.allow;
  }

  // Step 3: Apply user-specific overwrite (highest priority)
  if (userOverwrite) {
    // Formula: permissions = (permissions & ~deny) | allow
    permissions = (permissions & ~userOverwrite.deny) | userOverwrite.allow;
  }

  return permissions;
}

/**
 * Helper to convert ChannelPermission from DB to ChannelPermissionOverwrite
 */
export function convertToOverwrite(
  cp: ChannelPermission
): ChannelPermissionOverwrite {
  return {
    id: cp.id,
    channelId: cp.channelId,
    roleId: cp.roleId,
    userId: cp.userId,
    allow: typeof cp.allowPermissions === 'bigint' 
      ? Number(cp.allowPermissions) 
      : cp.allowPermissions,
    deny: typeof cp.denyPermissions === 'bigint' 
      ? Number(cp.denyPermissions) 
      : cp.denyPermissions,
  };
}
