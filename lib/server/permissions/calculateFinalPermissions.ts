import type { Role } from '@/types/server';
import { Permission } from '@/types/permissions';
import { hasPermission } from '@/lib/permissions/constants';
import type { ChannelPermissionOverwrite } from './calculateChannelPermissions';

export interface CalculateFinalPermissionsParams {
  memberRoles: Role[];
  baseRolePermissions: number; // Combined permissions from all roles
  categoryOverwrites: ChannelPermissionOverwrite[]; // Overwrites from parent category
  channelOverwrites: ChannelPermissionOverwrite[]; // Overwrites from channel itself
  userId: string;
  everyoneRoleId?: string; // ID of @everyone role
}

/**
 * Calculate final permissions following Discord's complete algorithm:
 * 1. Start with base permissions from roles
 * 2. Apply category overwrites (if channel has parentId)
 * 3. Apply channel overwrites
 * 4. Apply user-specific overwrite
 * 
 * Formula for each overwrite: permissions = (permissions & ~deny) | allow
 */
export function calculateFinalPermissions({
  memberRoles,
  baseRolePermissions,
  categoryOverwrites,
  channelOverwrites,
  userId,
  everyoneRoleId,
}: CalculateFinalPermissionsParams): number {
  // Start with base permissions
  let permissions = baseRolePermissions;

  // If user has ADMINISTRATOR permission, grant all permissions
  if (hasPermission(permissions, Permission.ADMINISTRATOR)) {
    return Permission.ADMINISTRATOR;
  }

  /**
   * Helper function to apply overwrites in correct order
   */
  const applyOverwrites = (
    overwrites: ChannelPermissionOverwrite[],
    _context: 'category' | 'channel'
  ): void => {
    // Separate overwrites by type
    const everyoneOverwrite = everyoneRoleId
      ? overwrites.find(ow => ow.roleId === everyoneRoleId)
      : null;
    
    const roleOverwrites = overwrites
      .filter(ow => ow.roleId && ow.roleId !== everyoneRoleId)
      .map(ow => {
        const role = memberRoles.find(r => r.id === ow.roleId);
        return { overwrite: ow, role, position: role?.position ?? 0 };
      })
      .filter(item => item.role) // Only include overwrites for roles the user has
      .sort((a, b) => b.position - a.position); // Sort by position DESC (higher first)

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
  };

  // Step 1: Apply category overwrites (if channel has a parent category)
  if (categoryOverwrites.length > 0) {
    applyOverwrites(categoryOverwrites, 'category');
  }

  // Step 2: Apply channel overwrites
  if (channelOverwrites.length > 0) {
    applyOverwrites(channelOverwrites, 'channel');
  }

  // Step 3: Apply user-specific overwrite (highest priority, from channel overwrites)
  const userOverwrite = channelOverwrites.find(ow => ow.userId === userId);
  if (userOverwrite) {
    // Formula: permissions = (permissions & ~deny) | allow
    permissions = (permissions & ~userOverwrite.deny) | userOverwrite.allow;
  }

  return permissions;
}
