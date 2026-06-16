'use client';

import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { invalidateServerViewSlices } from '@/lib/query-keys/serverViewKeys';
import { scheduleRefetchServerViewSlices } from '@/hooks/useServerViewQuery';
import { useServerMeta } from '@/hooks/serverView';
import type { Role } from '@/types/server';
import { Permission } from '@/types/permissions';
import { cn } from '@/lib/utils';
import { hasPermission, PERMISSION_META } from '@/lib/permissions/constants';
import { SERVER_LIMITS } from '@/lib/constants';

interface RolesSettingsProps {
  serverId: string;
  isOwner: boolean;
}

// Permission descriptions for tooltips and UI
const PERMISSION_DESCRIPTIONS: Partial<Record<Permission, string>> = {
  [Permission.MANAGE_SERVER]: 'Allows members to change server name, region, verification level, and delete the server.',
  [Permission.VIEW_SERVER]: 'Allows members to view the server and its basic information.',
  [Permission.MANAGE_ROLES]: 'Allows members to create new roles and edit roles lower than this role in the hierarchy.',
  [Permission.MANAGE_CHANNELS]: 'Allows members to create, edit, and delete channels.',
  [Permission.MANAGE_MEMBERS]: 'Allows members to change nicknames and manage server profiles of other members.',
  [Permission.KICK_MEMBERS]: 'Allows members to remove other members from the server.',
  [Permission.BAN_MEMBERS]: 'Allows members to permanently ban other members from the server.',
  [Permission.CREATE_INVITES]: 'Allows members to create invite links to the server.',
  [Permission.MANAGE_INVITES]: 'Allows members to view and delete invite links.',
  [Permission.VIEW_AUDIT_LOG]: 'Allows members to view the server audit log.',
  [Permission.VIEW_CHANNEL]: 'Allows members to view channels. Without this, channels are hidden.',
  [Permission.SEND_MESSAGES]: 'Allows members to send messages in text channels.',
  [Permission.SEND_TTS_MESSAGES]: 'Allows members to send text-to-speech messages.',
  [Permission.MANAGE_MESSAGES]: 'Allows members to delete and edit messages from other members.',
  [Permission.EMBED_LINKS]: 'Allows members to embed links in messages.',
  [Permission.ATTACH_FILES]: 'Allows members to upload files and images.',
  [Permission.READ_MESSAGE_HISTORY]: 'Allows members to read previous messages in channels.',
  [Permission.MENTION_EVERYONE]: 'Allows members to mention @everyone and @here, which notifies all members.',
  [Permission.USE_EXTERNAL_EMOJIS]: 'Allows members to use emojis from other servers.',
  [Permission.ADD_REACTIONS]: 'Allows members to add reactions to messages.',
  [Permission.CONNECT]: 'Allows members to join voice channels.',
  [Permission.SPEAK]: 'Allows members to speak in voice channels.',
  [Permission.MUTE_MEMBERS]: 'Allows members to mute other members in voice channels.',
  [Permission.DEAFEN_MEMBERS]: 'Allows members to deafen other members in voice channels.',
  [Permission.MOVE_MEMBERS]: 'Allows members to move other members between voice channels.',
  [Permission.USE_VOICE_ACTIVATION]: 'Allows members to use voice activation instead of push-to-talk.',
  [Permission.PRIORITY_SPEAKER]: 'Allows members to be heard more clearly in voice channels.',
  [Permission.USE_APPLICATION_COMMANDS]: 'Allows members to use slash commands and application commands.',
  [Permission.MANAGE_EVENTS]: 'Allows members to create and manage server events.',
  [Permission.MANAGE_WEBHOOKS]: 'Allows members to create, edit, and delete webhooks.',
  [Permission.USE_EXTERNAL_STICKERS]: 'Allows members to use stickers from other servers.',
  [Permission.SEND_VOICE_MESSAGES]: 'Allows members to send voice messages.',
  // Note: ADMINISTRATOR is not included due to bit shift overflow conflict (1 << 36 wraps to 1 << 4 = MANAGE_MEMBERS)
  // It's handled separately in the UI with a warning
};

// Reorganized permission groups with better categorization
const PERMISSION_GROUPS = [
  {
    label: 'General Permissions',
    description: 'Basic server and member management permissions',
    permissions: [
      { key: 'VIEW_SERVER', label: 'View Server' },
      { key: 'MANAGE_MEMBERS', label: 'Manage Members' },
      { key: 'CREATE_INVITES', label: 'Create Invites' },
      { key: 'MANAGE_INVITES', label: 'Manage Invites' },
    ],
  },
  {
    label: 'Moderation Permissions',
    description: 'Permissions for moderating the server and its members',
    permissions: [
      { key: 'KICK_MEMBERS', label: 'Kick Members' },
      { key: 'BAN_MEMBERS', label: 'Ban Members' },
      { key: 'VIEW_AUDIT_LOG', label: 'View Audit Log' },
    ],
  },
  {
    label: 'Server Management',
    description: 'Permissions for managing server settings and structure',
    permissions: [
      { key: 'MANAGE_SERVER', label: 'Manage Server' },
      { key: 'MANAGE_ROLES', label: 'Manage Roles' },
      { key: 'MANAGE_CHANNELS', label: 'Manage Channels' },
    ],
  },
  {
    label: 'Text Channel Permissions',
    description: 'Permissions for interacting with text channels',
    permissions: [
      { key: 'VIEW_CHANNEL', label: 'View Channel' },
      { key: 'SEND_MESSAGES', label: 'Send Messages' },
      { key: 'SEND_TTS_MESSAGES', label: 'Send TTS Messages' },
      { key: 'MANAGE_MESSAGES', label: 'Manage Messages' },
      { key: 'EMBED_LINKS', label: 'Embed Links' },
      { key: 'ATTACH_FILES', label: 'Attach Files' },
      { key: 'READ_MESSAGE_HISTORY', label: 'Read Message History' },
      { key: 'MENTION_EVERYONE', label: 'Mention Everyone' },
      { key: 'USE_EXTERNAL_EMOJIS', label: 'Use External Emojis' },
      { key: 'ADD_REACTIONS', label: 'Add Reactions' },
    ],
  },
  {
    label: 'Voice Channel Permissions',
    description: 'Permissions for interacting with voice channels',
    permissions: [
      { key: 'CONNECT', label: 'Connect' },
      { key: 'SPEAK', label: 'Speak' },
      { key: 'MUTE_MEMBERS', label: 'Mute Members' },
      { key: 'DEAFEN_MEMBERS', label: 'Deafen Members' },
      { key: 'MOVE_MEMBERS', label: 'Move Members' },
      { key: 'USE_VOICE_ACTIVATION', label: 'Use Voice Activation' },
      { key: 'PRIORITY_SPEAKER', label: 'Priority Speaker' },
      { key: 'SEND_VOICE_MESSAGES', label: 'Send Voice Messages' },
    ],
  },
  {
    label: 'Advanced Permissions',
    description: 'Advanced features and integrations',
    permissions: [
      { key: 'USE_APPLICATION_COMMANDS', label: 'Use Application Commands' },
      { key: 'MANAGE_EVENTS', label: 'Manage Events' },
      { key: 'MANAGE_WEBHOOKS', label: 'Manage Webhooks' },
      { key: 'USE_EXTERNAL_STICKERS', label: 'Use External Stickers' },
    ],
  },
];

export function RolesSettings({ serverId, isOwner }: RolesSettingsProps) {
  const queryClient = useQueryClient();
  const { data, isLoading: isInitialLoading } = useServerMeta(serverId);
  const roles = useMemo(() => data?.roles ?? [], [data?.roles]);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleName, setRoleName] = useState('');
  const [roleColor, setRoleColor] = useState('#99aab5');
  const [rolePermissions, setRolePermissions] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const refreshAfterMutation = () => {
    setTimeout(() => {
      invalidateServerViewSlices(queryClient, serverId);
      scheduleRefetchServerViewSlices(queryClient, serverId);
    }, 0);
  };

  const handleCreateRole = async () => {
    try {
      const response = await fetch(`/api/servers/${serverId}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: 'New Role',
          color: '#99aab5',
          permissions: 0,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to create role' }));
        setError((errorData as { error?: string }).error || 'Failed to create role');
        return;
      }
      const data = (await response.json()) as { roleId?: string };
      refreshAfterMutation();
      if (data.roleId) {
        const newRole: Role = {
          id: data.roleId,
          serverId,
          name: 'New Role',
          color: '#99aab5',
          position: 0,
          permissions: BigInt(0),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        setEditingRole(newRole);
        setRoleName(newRole.name);
        setRoleColor(newRole.color);
        setRolePermissions(Number(newRole.permissions));
      }
    } catch (err) {
      console.error('Error creating role:', err);
      setError(err instanceof Error ? err.message : 'Failed to create role');
    }
  };

  const handleMoveRole = async (roleId: string, direction: 'up' | 'down') => {
    const roleIndex = roles.findIndex((r) => r.id === roleId);
    if (roleIndex === -1) return;

    const newIndex = direction === 'up' ? roleIndex - 1 : roleIndex + 1;
    if (newIndex < 0 || newIndex >= roles.length) return;

    const reorderedRoleIds = [...roles.map((r) => r.id)];
    const temp = reorderedRoleIds[roleIndex];
    if (!temp) return;
    reorderedRoleIds[roleIndex] = reorderedRoleIds[newIndex]!;
    reorderedRoleIds[newIndex] = temp;

    try {
      const response = await fetch(`/api/servers/${serverId}/roles/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ roleIds: reorderedRoleIds }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to reorder roles' }));
        setError((errorData as { error?: string }).error || 'Failed to reorder roles');
        return;
      }
      refreshAfterMutation();
    } catch (err) {
      console.error('Error reordering roles:', err);
      setError(err instanceof Error ? err.message : 'Failed to reorder roles');
    }
  };

  const handleSaveRole = async () => {
    if (!editingRole) return;

    setError(null);

    try {
      const response = await fetch(`/api/servers/${serverId}/roles/${editingRole.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: roleName,
          color: roleColor,
          permissions: rolePermissions,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to update role' }));
        setError((errorData as { error?: string }).error || 'Failed to update role');
        return;
      }

      refreshAfterMutation();
      setEditingRole(null);
    } catch (err) {
      console.error('Error updating role:', err);
      setError('Failed to update role. Please try again.');
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    const role = roles.find(r => r.id === roleId);
    if (!role) return;

    // Prevent deleting default roles
    if (role.name === '@everyone' || role.name === 'admin' || role.name === 'user' || role.name === 'moderator') {
      setError('Cannot delete default roles');
      return;
    }

    if (!confirm(`Are you sure you want to delete the role "${role.name}"? This action cannot be undone.`)) {
      return;
    }

    setIsDeleting(roleId);
    setError(null);

    try {
      const response = await fetch(`/api/servers/${serverId}/roles/${roleId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to delete role' }));
        setError((errorData as { error?: string }).error || 'Failed to delete role');
        setIsDeleting(null);
        return;
      }

      refreshAfterMutation();
    } catch (err) {
      console.error('Error deleting role:', err);
      setError('Failed to delete role. Please try again.');
    } finally {
      setIsDeleting(null);
    }
  };

  const togglePermission = (permission: Permission) => {
    setRolePermissions((prev) => prev ^ permission);
  };

  // Sort roles by position DESC (highest = top = strongest)
  // Separate @everyone to always be at bottom
  const sortedRoles = useMemo(() => {
    if (isInitialLoading) return [];
    const everyoneRole = roles.find(r => r.name === '@everyone');
    const otherRoles = roles
      .filter(r => r.name !== '@everyone')
      .sort((a, b) => b.position - a.position); // DESC: higher position = top
    
    return [...otherRoles, ...(everyoneRole ? [everyoneRole] : [])];
  }, [roles, isInitialLoading]);

  if (isInitialLoading) {
    return <div className="text-text-muted">Loading roles...</div>;
  }

  // Helper to check if role has ADMINISTRATOR permission
  const checkHasAdministrator = (rolePermissions: bigint): boolean => {
    const perms = Number(rolePermissions);
    return hasPermission(perms, Permission.ADMINISTRATOR);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Roles</h2>
          <p className="text-text-muted text-sm">Manage server roles and permissions</p>
        </div>
        {isOwner && (
          <Button onClick={handleCreateRole}>Create Role</Button>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-md p-3">
          <div className="flex items-start gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-red-400 mt-0.5 flex-shrink-0"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4" />
              <path d="M12 16h.01" />
            </svg>
            <div className="flex-1">
              <p className="text-sm text-red-400">{error}</p>
              <button
                onClick={() => setError(null)}
                className="text-xs text-red-300 hover:text-red-200 mt-1"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hierarchy explanation */}
      <div className="bg-bg-tertiary/50 border border-border-primary rounded-md p-3">
        <div className="flex items-start gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-text-muted mt-0.5 flex-shrink-0"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
          <p className="text-sm text-text-secondary">
            Roles higher in this list have more power and can manage roles below them.
          </p>
        </div>
      </div>

      {/* Visual hierarchy indicator - arrow pointing down */}
      {sortedRoles.length > 0 && (
        <div className="flex items-center gap-2 text-text-muted text-xs">
          <span className="font-semibold">Most Powerful</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="opacity-50"
          >
            <path d="M12 5v14" />
            <path d="M19 12l-7 7-7-7" />
          </svg>
          <span className="font-semibold">Least Powerful</span>
        </div>
      )}

      {/* Roles list - vertical hierarchy */}
      <div className="space-y-3">
        {sortedRoles.map((role, index) => {
          const isEveryone = role.name === '@everyone';
          const isTop = index === 0;
          const isBottom = index === sortedRoles.length - 1;
          const hasAdmin = checkHasAdministrator(role.permissions);
          const roleIndex = roles.findIndex((r) => r.id === role.id);
          const canMoveUp = roleIndex > 0;
          const canMoveDown = roleIndex < roles.length - 1;

          return (
            <div
              key={role.id}
              className={cn(
                'relative flex items-center justify-between p-4 rounded-lg',
                'bg-bg-tertiary/30 border border-border-primary',
                'transition-all duration-150',
                'hover:bg-bg-tertiary/50 hover:border-green-primary/30',
                isTop && 'border-t-2 border-t-green-primary/50',
                isEveryone && 'bg-bg-quaternary/30 border-dashed'
              )}
            >
              {/* Left side: Role info */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {/* Role color circle */}
                <div
                  className="w-5 h-5 rounded-full flex-shrink-0 border-2 border-bg-secondary"
                  style={{ backgroundColor: role.color }}
                />
                
                {/* Role name and badges */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="font-semibold text-text-primary truncate">
                    {role.name}
                  </span>
                  
                  {/* Admin badge */}
                  {hasAdmin && (
                    <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-red-500/20 text-red-400 border border-red-500/30">
                      Admin
                    </span>
                  )}
                  
                  {/* Default role badge for @everyone */}
                  {isEveryone && (
                    <span className="px-2 py-0.5 text-xs font-medium rounded-md bg-bg-quaternary text-text-muted border border-border-primary">
                      Default role
                    </span>
                  )}
                  
                  <span className="text-xs text-text-muted ml-auto">
                    {isEveryone ? 'All members' : (role.memberCount !== undefined ? `${role.memberCount} members` : '—')}
                  </span>
                </div>
              </div>

              {/* Right side: Actions */}
              {isOwner && (
                <div className="flex items-center gap-1.5 ml-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleMoveRole(role.id, 'up')}
                    disabled={!canMoveUp}
                    title="Move up (more powerful)"
                    className="h-8 w-8 p-0"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M18 15l-6-6-6 6" />
                    </svg>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleMoveRole(role.id, 'down')}
                    disabled={!canMoveDown || isEveryone}
                    title={isEveryone ? "Cannot move @everyone" : "Move down (less powerful)"}
                    className="h-8 w-8 p-0"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingRole(role);
                      setRoleName(role.name);
                      setRoleColor(role.color);
                      setRolePermissions(Number(role.permissions));
                      setError(null);
                    }}
                    className="ml-1"
                  >
                    Edit
                  </Button>
                  {/* Delete button - only for non-default roles */}
                  {!isEveryone && role.name !== 'admin' && role.name !== 'user' && role.name !== 'moderator' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteRole(role.id)}
                      disabled={isDeleting === role.id}
                      title="Delete role"
                      className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    >
                      {isDeleting === role.id ? (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="animate-spin"
                        >
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                      ) : (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M3 6h18" />
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                      )}
                    </Button>
                  )}
                </div>
              )}

              {/* Visual separator line (except for last item) */}
              {!isBottom && (
                <div className="absolute bottom-0 left-0 right-0 h-px bg-border-primary/50" />
              )}
            </div>
          );
        })}
      </div>

      {editingRole && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-bg-secondary rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">Edit Role</h3>
            
            <div className="space-y-4 mb-6">
              <div>
                <Label htmlFor="role-name">Role Name</Label>
                <Input
                  id="role-name"
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  maxLength={SERVER_LIMITS.MAX_ROLE_NAME_LENGTH}
                />
              </div>
              
              <div>
                <Label htmlFor="role-color">Role Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="role-color"
                    type="color"
                    value={roleColor}
                    onChange={(e) => setRoleColor(e.target.value)}
                    className="w-16 h-10 rounded border border-border-primary"
                  />
                  <Input
                    type="text"
                    value={roleColor}
                    onChange={(e) => setRoleColor(e.target.value)}
                    placeholder="#99aab5"
                    pattern="^#[0-9A-Fa-f]{6}$"
                  />
                </div>
              </div>
            </div>

            <div className="mb-6">
              <h4 className="font-semibold mb-4 text-lg">Permissions</h4>
              
              {/* Regular permission groups */}
              {PERMISSION_GROUPS.map((group) => (
                <div key={group.label} className="mb-6">
                  <div className="mb-3">
                    <h5 className="font-semibold text-text-primary mb-1">{group.label}</h5>
                    {group.description && (
                      <p className="text-xs text-text-muted">{group.description}</p>
                    )}
                  </div>
                  <div className="space-y-3">
                    {group.permissions.map((perm) => {
                      const permValue = Permission[perm.key as keyof typeof Permission];
                      const hasPerm = (rolePermissions & permValue) !== 0;
                      const description = PERMISSION_DESCRIPTIONS[permValue];
                      
                      return (
                        <div
                          key={perm.key}
                          className="group relative p-3 rounded-lg bg-bg-tertiary/30 border border-border-primary hover:bg-bg-tertiary/50 transition-colors"
                        >
                          <label className="flex items-start gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={hasPerm}
                              onChange={() => togglePermission(permValue)}
                              className="mt-1 w-4 h-4 rounded border-border-primary text-green-primary focus:ring-green-primary focus:ring-2"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-text-primary">{perm.label}</span>
                                {PERMISSION_META[permValue]?.implemented === false && (
                                  <span className="text-xs text-text-muted" title="Not enforced yet">
                                    🧪 Beta — not enforced yet
                                  </span>
                                )}
                                {/* Info icon for tooltip */}
                                {description && (
                                  <div className="relative group/info">
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      width="14"
                                      height="14"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      className="text-text-muted hover:text-text-secondary transition-colors cursor-help"
                                    >
                                      <circle cx="12" cy="12" r="10" />
                                      <path d="M12 16v-4" />
                                      <path d="M12 8h.01" />
                                    </svg>
                                    {/* Tooltip */}
                                    <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover/info:block z-50 pointer-events-none">
                                      <div className="bg-bg-primary border border-border-primary rounded-md p-2 shadow-lg max-w-xs w-64">
                                        <p className="text-xs text-text-secondary leading-relaxed">
                                          {description}
                                        </p>
                                        {/* Tooltip arrow */}
                                        <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-border-primary" />
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                              {/* Description text */}
                              {description && (
                                <p className="text-xs text-text-muted mt-1.5 ml-6 leading-relaxed">
                                  {description}
                                </p>
                              )}
                            </div>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Dangerous Administrator permission - separated */}
              <div className="mt-8 pt-6 border-t-2 border-red-500/30">
                <div className="mb-3">
                  <h5 className="font-semibold text-red-400 mb-1">⚠️ Dangerous Permissions</h5>
                  <p className="text-xs text-text-muted">These permissions grant extensive control and should be used with extreme caution.</p>
                </div>
                <div className="space-y-3">
                  <div className="group relative p-4 rounded-lg bg-red-500/10 border-2 border-red-500/30 hover:bg-red-500/15 transition-colors">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(rolePermissions & Permission.ADMINISTRATOR) !== 0}
                        onChange={() => togglePermission(Permission.ADMINISTRATOR)}
                        className="mt-1 w-4 h-4 rounded border-red-500/50 text-red-500 focus:ring-red-500 focus:ring-2"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-red-400">Administrator</span>
                          {/* Info icon for tooltip */}
                          <div className="relative group/info">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="text-red-400 hover:text-red-300 transition-colors cursor-help"
                            >
                              <circle cx="12" cy="12" r="10" />
                              <path d="M12 16v-4" />
                              <path d="M12 8h.01" />
                            </svg>
                            {/* Tooltip */}
                            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover/info:block z-50 pointer-events-none">
                              <div className="bg-bg-primary border-2 border-red-500/50 rounded-md p-3 shadow-lg max-w-xs w-80">
                                <p className="text-xs text-text-secondary leading-relaxed font-medium mb-2 text-red-400">
                                  ⚠️ Extremely Dangerous Permission
                                </p>
                                <p className="text-xs text-text-secondary leading-relaxed">
                                  {PERMISSION_DESCRIPTIONS[Permission.ADMINISTRATOR] ?? 'Grants all permissions and bypasses role hierarchy. This is extremely dangerous and should only be given to trusted administrators.'}
                                </p>
                                {/* Tooltip arrow */}
                                <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-red-500/50" />
                              </div>
                            </div>
                          </div>
                        </div>
                        {/* Description text */}
                        <p className="text-xs text-red-300/80 mt-2 ml-6 leading-relaxed">
                          {PERMISSION_DESCRIPTIONS[Permission.ADMINISTRATOR] ?? 'Grants all permissions and bypasses role hierarchy. This is extremely dangerous and should only be given to trusted administrators.'}
                        </p>
                        {/* Warning box */}
                        {(rolePermissions & Permission.ADMINISTRATOR) !== 0 && (
                          <div className="mt-3 ml-6 p-3 bg-red-500/20 border border-red-500/40 rounded-md">
                            <div className="flex items-start gap-2">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="text-red-400 flex-shrink-0 mt-0.5"
                              >
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                <line x1="12" y1="9" x2="12" y2="13" />
                                <line x1="12" y1="17" x2="12.01" y2="17" />
                              </svg>
                              <p className="text-xs text-red-300 leading-relaxed">
                                <strong>⚠️ Warning:</strong> This permission grants ALL permissions and bypasses role hierarchy. Use with extreme caution.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-md p-3 mb-4">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" onClick={() => {
                setEditingRole(null);
                setError(null);
              }}>
                Cancel
              </Button>
              <Button onClick={handleSaveRole}>Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
