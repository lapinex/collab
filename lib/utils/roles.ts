import type { Role } from '@/types/server';
import { Permission } from '@/types/permissions';
import { hasPermission } from '@/lib/permissions/constants';

/**
 * Get the highest role (by position) from an array of roles
 */
export function getHighestRole(roles: Role[]): Role | null {
  if (!roles || roles.length === 0) return null;
  
  return roles.reduce((highest, role) => {
    if (!highest) return role;
    return role.position > highest.position ? role : highest;
  }, roles[0]!);
}

/**
 * Get role color for a user (from highest role)
 */
export function getRoleColor(roles: Role[]): string | null {
  const highestRole = getHighestRole(roles);
  return highestRole?.color || null;
}

/**
 * Check if user has ADMINISTRATOR permission
 */
export function hasAdministratorPermission(roles: Role[]): boolean {
  if (!roles || roles.length === 0) return false;
  
  // Check if any role has ADMINISTRATOR permission
  return roles.some(role => {
    const permissions = typeof role.permissions === 'bigint' 
      ? Number(role.permissions)
      : role.permissions;
    return hasPermission(permissions, Permission.ADMINISTRATOR);
  });
}

/**
 * Sort users by role hierarchy (highest position first, then by username)
 */
export function sortUsersByRoleHierarchy<T extends { userId: string; userName: string }>(
  users: T[],
  getUserRoles: (userId: string) => Role[]
): T[] {
  return [...users].sort((a, b) => {
    const aRoles = getUserRoles(a.userId);
    const bRoles = getUserRoles(b.userId);
    
    const aHighest = getHighestRole(aRoles);
    const bHighest = getHighestRole(bRoles);
    
    // If both have roles, sort by position DESC
    if (aHighest && bHighest) {
      const positionDiff = bHighest.position - aHighest.position;
      if (positionDiff !== 0) return positionDiff;
    }
    
    // If only one has a role, that one comes first
    if (aHighest && !bHighest) return -1;
    if (!aHighest && bHighest) return 1;
    
    // If neither has roles or same position, sort by username
    return a.userName.localeCompare(b.userName);
  });
}

/**
 * Group users by their highest role
 */
export function groupUsersByRole<T extends { userId: string; userName: string }>(
  users: T[],
  getUserRoles: (userId: string) => Role[]
): Array<{ role: Role | null; users: T[] }> {
  const roleGroups = new Map<string | 'no-role', { role: Role | null; users: T[] }>();
  
  for (const user of users) {
    const userRoles = getUserRoles(user.userId);
    const highestRole = getHighestRole(userRoles);
    
    const key = highestRole ? highestRole.id : 'no-role';
    
    if (!roleGroups.has(key)) {
      roleGroups.set(key, {
        role: highestRole,
        users: [],
      });
    }
    
    roleGroups.get(key)!.users.push(user);
  }
  
  // Convert to array and sort
  const groups = Array.from(roleGroups.values());
  
  // Sort groups by role position DESC (highest first)
  // @everyone (position 0 or lowest) should be last
  groups.sort((a, b) => {
    // No role group goes to the end
    if (!a.role && !b.role) return 0;
    if (!a.role) return 1;
    if (!b.role) return -1;
    
    // @everyone role (usually position 0 or name === '@everyone') goes last
    const aIsEveryone = a.role.name === '@everyone' || a.role.position === 0;
    const bIsEveryone = b.role.name === '@everyone' || b.role.position === 0;
    
    if (aIsEveryone && !bIsEveryone) return 1;
    if (!aIsEveryone && bIsEveryone) return -1;
    
    // Sort by position DESC (highest first)
    return b.role.position - a.role.position;
  });
  
  // Sort users within each group by username
  for (const group of groups) {
    group.users.sort((a, b) => a.userName.localeCompare(b.userName));
  }
  
  return groups;
}
