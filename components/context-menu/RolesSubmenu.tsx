'use client';

import { useState, useMemo } from 'react';
import { useServerMeta } from '@/hooks/serverView';
import { cn } from '@/lib/utils';
import type { Role } from '@/types/server';

interface RolesSubmenuProps {
  serverId: string;
  userId: string;
  currentUserRoles: Role[]; // Current user's roles (for hierarchy check)
  userRoles: Role[]; // Target user's roles
  onRoleToggle: (roleId: string, hasRole: boolean) => Promise<void>;
  onClose?: () => void;
}

export function RolesSubmenu({
  serverId,
  userId: _userId,
  currentUserRoles,
  userRoles,
  onRoleToggle,
  onClose: _onClose,
}: RolesSubmenuProps) {
  const [togglingRoleId, setTogglingRoleId] = useState<string | null>(null);

  const { data: meta, isLoading } = useServerMeta(serverId ?? null);
  const roles = useMemo(
    () => (meta?.roles ?? []).sort((a, b) => b.position - a.position),
    [meta?.roles]
  );

  const currentUserHighestPosition = currentUserRoles.length > 0
    ? Math.max(...currentUserRoles.map(r => r.position))
    : -1;

  const handleRoleToggle = async (role: Role) => {
    const hasRole = userRoles.some(r => r.id === role.id);
    
    setTogglingRoleId(role.id);
    try {
      await onRoleToggle(role.id, hasRole);
    } catch (err) {
      console.error('Error toggling role:', err);
    } finally {
      setTogglingRoleId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-w-[240px] p-2">
        <div className="text-xs text-text-muted">Loading roles...</div>
      </div>
    );
  }

  if (roles.length === 0) {
    return (
      <div className="min-w-[240px] p-2">
        <div className="text-xs text-text-muted">No roles available</div>
      </div>
    );
  }

  return (
    <div className="min-w-[240px] max-h-[400px] overflow-y-auto">
      {roles.map((role) => {
        const hasRole = userRoles.some(r => r.id === role.id);
        const isDisabled = role.position > currentUserHighestPosition;
        const isToggling = togglingRoleId === role.id;

        return (
          <label
            key={role.id}
            className={cn(
              'flex items-center gap-2 px-3 py-2 cursor-pointer',
              'hover:bg-bg-hover transition-colors',
              isDisabled && 'opacity-50 cursor-not-allowed',
              isToggling && 'opacity-50'
            )}
            title={isDisabled ? 'You cannot manage roles higher than your highest role' : undefined}
          >
            <input
              type="checkbox"
              checked={hasRole}
              onChange={() => !isDisabled && handleRoleToggle(role)}
              disabled={isDisabled || isToggling}
              className="w-4 h-4 rounded border-border-primary text-green-primary focus:ring-green-primary focus:ring-2"
            />
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: role.color }}
              />
              <span className="text-sm text-text-primary truncate">{role.name}</span>
              {isDisabled && (
                <span className="text-xs text-text-muted ml-auto">Locked</span>
              )}
            </div>
          </label>
        );
      })}
    </div>
  );
}
