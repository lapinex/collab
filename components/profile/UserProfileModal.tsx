'use client';

import { useState, useEffect, useMemo } from 'react';
import { Modal } from '@/components/ui/modal';
import { Avatar, PresenceStatus } from './Avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { RolesSubmenu } from '@/components/context-menu/RolesSubmenu';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateServerViewSlices } from '@/lib/query-keys/serverViewKeys';
import { useServerMembers, useServerMeta } from '@/hooks/serverView';
import { useServerPermissions } from '@/hooks/useServerPermissions';
import { getRoleColor, hasAdministratorPermission } from '@/lib/utils/roles';
import type { Role } from '@/types/server';
import { USER_LIMITS } from '@/lib/constants';
import { Ban, UserX, Clock, Edit2, X, Check } from 'lucide-react';

interface UserRole {
  id: string;
  name: string;
  color: string;
}

interface UserProfileData {
  id: string;
  name: string;
  email?: string;
  avatarUrl: string | null;
  status: PresenceStatus;
  customStatus?: string;
  lastSeen?: Date;
  roles?: UserRole[];
  joinedAt?: Date;
  globalRole?: 'user' | 'moderator' | 'admin';
}

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfileData | null;
  currentUserId?: string;
  serverId?: string; // Required for role management
  isAdmin?: boolean;
  canManageRoles?: boolean;
  onSendMessage?: (userId: string) => Promise<void>;
  onChangeRole?: (userId: string, roleId: string) => void; // Legacy - kept for compatibility
  onEditProfile?: (userId: string) => void;
  onBanUser?: (userId: string) => Promise<void>;
}

export function UserProfileModal({
  isOpen,
  onClose,
  user,
  currentUserId,
  serverId,
  isAdmin: _isAdmin = false,
  canManageRoles: canManageRolesProp = false,
  onSendMessage,
  onChangeRole: _onChangeRole,
  onEditProfile: _onEditProfile,
  onBanUser,
}: UserProfileModalProps) {
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isBanning, setIsBanning] = useState(false);
  const [isKicking, setIsKicking] = useState(false);
  const [isTimingOut, setIsTimingOut] = useState(false);
  const [currentUserRoles, setCurrentUserRoles] = useState<Role[]>([]);
  const [userRoles, setUserRoles] = useState<Role[]>([]);
  const [isLoadingRoles, setIsLoadingRoles] = useState(false);
  const [serverNickname, setServerNickname] = useState<string | null>(null);
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [isSavingNickname, setIsSavingNickname] = useState(false);
  const [canTimeout] = useState(false);

  const queryClient = useQueryClient();
  const { data: membersData } = useServerMembers(serverId ?? null);
  const { data: metaData } = useServerMeta(serverId ?? null);
  const { permissions: serverPerms } = useServerPermissions(serverId ?? null);
  const canManageRoles = canManageRolesProp !== undefined ? canManageRolesProp : serverPerms.canManageRoles;
  const canManageMembers = serverPerms.canManageMembers;
  const canKick = serverPerms.canKickMembers;
  const canBan = serverPerms.canBanMembers;
  const serverMembers = useMemo(() => (serverId ? (membersData ?? []) : []), [serverId, membersData]);
  const serverView = useMemo(() => (metaData ? { roles: metaData.roles } : null), [metaData]);
  const userMember = user?.id ? serverMembers.find((m) => m.id === user.id) : null;
  const displayUserRoles: Role[] = useMemo(() => {
    const fromMember = userMember?.roles;
    const raw = fromMember ?? userRoles;
    if (!raw.length) return [];
    if (fromMember && serverId) {
      return (fromMember as Array<{ id: string; name: string; color: string; position: number }>).map((r) => ({
        id: r.id,
        serverId,
        name: r.name,
        color: r.color,
        position: r.position,
        permissions: BigInt(0),
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
    }
    return raw as Role[];
  }, [userMember?.roles, userRoles, serverId]);
  const roleColor = getRoleColor(displayUserRoles);
  const isAdministrator = hasAdministratorPermission(displayUserRoles);
  const sortedRoles = displayUserRoles.length > 0
    ? [...displayUserRoles].sort((a, b) => b.position - a.position)
    : [];

  const isOwnProfile = currentUserId === user?.id;
  const displayName = serverNickname || user?.name || '';

  // Handle nickname save
  const handleSaveNickname = async () => {
    if (!serverId || !user?.id) return;
    
    setIsSavingNickname(true);
    try {
      // TODO: Create API endpoint for editing other users' nicknames
      // For now, this will only work if the API supports it
      // The current /api/servers/[serverId]/profile only allows editing own profile
      // We need: PUT /api/servers/[serverId]/members/[userId]/nickname
      const response = await fetch(`/api/servers/${serverId}/members/${user.id}/nickname`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          nickname: nicknameInput.trim() || null,
        }),
      });
      
      if (!response.ok) {
        // Try to get error message from API
        let errorMessage = 'Failed to update nickname';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // If response is not JSON, use status text
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      const newNickname = (data as { nickname?: string | null }).nickname ?? null;
      setServerNickname(newNickname);
      setIsEditingNickname(false);
      if (serverId) {
        invalidateServerViewSlices(queryClient, serverId);
      }
    } catch (err) {
      console.error('Error saving nickname:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to update nickname';
      alert(errorMessage);
      setNicknameInput(serverNickname || '');
    } finally {
      setIsSavingNickname(false);
    }
  };
  
  const handleCancelNickname = () => {
    setNicknameInput(serverNickname || '');
    setIsEditingNickname(false);
  };
  
  // Handle moderation actions
  const handleKick = async () => {
    if (!serverId || !user?.id || !confirm(`Are you sure you want to kick ${displayName}?`)) return;
    
    setIsKicking(true);
    try {
      // TODO: Implement kick API endpoint
      const response = await fetch(`/api/servers/${serverId}/members/${user.id}/kick`, {
        method: 'POST',
        credentials: 'include',
      });
      
      if (!response.ok) throw new Error('Failed to kick user');
      
      onClose();
    } catch (err) {
      console.error('Error kicking user:', err);
      alert('Failed to kick user');
    } finally {
      setIsKicking(false);
    }
  };
  
  const handleBan = async () => {
    if (!serverId || !user?.id || !confirm(`Are you sure you want to ban ${displayName}?`)) return;
    
    setIsBanning(true);
    try {
      if (onBanUser) {
        await onBanUser(user.id);
        onClose();
      } else {
        // TODO: Implement ban API endpoint
        const response = await fetch(`/api/servers/${serverId}/members/${user.id}/ban`, {
          method: 'POST',
          credentials: 'include',
        });
        
        if (!response.ok) throw new Error('Failed to ban user');
        onClose();
      }
    } catch (err) {
      console.error('Error banning user:', err);
      alert('Failed to ban user');
    } finally {
      setIsBanning(false);
    }
  };
  
  const handleTimeout = async () => {
    if (!serverId || !user?.id) return;
    
    const duration = prompt('Enter timeout duration in minutes (1-43200):');
    if (!duration || isNaN(Number(duration)) || Number(duration) < 1 || Number(duration) > 43200) {
      return;
    }
    
    setIsTimingOut(true);
    try {
      // TODO: Implement timeout API endpoint
      const response = await fetch(`/api/servers/${serverId}/members/${user.id}/timeout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ durationMinutes: Number(duration) }),
      });
      
      if (!response.ok) throw new Error('Failed to timeout user');
      
      alert(`User ${displayName} has been timed out for ${duration} minutes`);
    } catch (err) {
      console.error('Error timing out user:', err);
      alert('Failed to timeout user');
    } finally {
      setIsTimingOut(false);
    }
  };

  // Derive current user's roles, target user's roles, and nickname from server view (no separate GET /members)
  useEffect(() => {
    if (!serverId || !currentUserId || !user?.id || !serverMembers.length) {
      if (serverId && user?.id && serverMembers.length === 0 && serverView) {
        setIsLoadingRoles(false);
      }
      return;
    }

    const currentUserMember = serverMembers.find((m) => m.id === currentUserId);
    if (currentUserMember?.roles) {
      const roles = currentUserMember.roles.map((r) => ({
        id: r.id,
        serverId: serverId!,
        name: r.name,
        color: r.color,
        position: r.position,
        permissions: BigInt(0) as Role['permissions'],
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      setCurrentUserRoles(roles);
    }

    const targetMember = serverMembers.find((m) => m.id === user.id);
    if (targetMember?.roles) {
      setUserRoles(
        targetMember.roles.map((r) => ({
          id: r.id,
          serverId: serverId!,
          name: r.name,
          color: r.color,
          position: r.position,
          permissions: BigInt(0) as Role['permissions'],
          createdAt: new Date(),
          updatedAt: new Date(),
        }))
      );
    }
    if (targetMember?.nickname !== undefined) {
      setServerNickname(targetMember.nickname ?? null);
      setNicknameInput(targetMember.nickname ?? '');
    }
    setIsLoadingRoles(false);
  }, [serverId, currentUserId, user?.id, serverMembers, serverView]);

  // Handle role toggle
  const handleRoleToggle = async (roleId: string, hasRole: boolean) => {
    if (!serverId || !user?.id) return;

    try {
      if (hasRole) {
        const response = await fetch(`/api/servers/${serverId}/members/${user.id}/role?roleId=${roleId}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (!response.ok) throw new Error('Failed to remove role');
        setUserRoles((prev) => prev.filter((r) => r.id !== roleId));
      } else {
        const response = await fetch(`/api/servers/${serverId}/members/${user.id}/role`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ roleId }),
        });
        if (!response.ok) throw new Error('Failed to add role');
        const addedRole = serverView?.roles?.find((r) => r.id === roleId);
        if (addedRole) {
          setUserRoles((prev) =>
            [...prev, { ...addedRole, permissions: typeof addedRole.permissions === 'bigint' ? addedRole.permissions : BigInt(addedRole.permissions ?? 0) }].sort(
              (a, b) => b.position - a.position
            )
          );
        }
      }
      if (serverId) invalidateServerViewSlices(queryClient, serverId);
    } catch (err) {
      console.error('Error toggling role:', err);
      if (serverId) invalidateServerViewSlices(queryClient, serverId);
    }
  };

  const formatLastSeen = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const statusText: Record<PresenceStatus, string> = {
    online: 'Online',
    idle: 'Idle',
    dnd: 'Do Not Disturb',
    offline: 'Offline',
  };

  const statusColors: Record<PresenceStatus, string> = {
    online: 'text-status-online',
    idle: 'text-status-idle',
    dnd: 'text-status-dnd',
    offline: 'text-status-offline',
  };

  if (!user) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-sm">
      {/* Banner / Header area */}
      <div className="h-24 bg-gradient-to-br from-green-primary/30 to-green-dark/30 rounded-t-lg" />
      
      {/* Profile content */}
      <div className="relative px-4 pb-4">
        {/* Avatar - positioned to overlap banner */}
        <div className="absolute -top-12 left-4">
          <div className="p-1 bg-bg-secondary rounded-full">
            <Avatar
              src={user.avatarUrl}
              name={user.name}
              size="xl"
              status={user.status}
              showStatus
            />
          </div>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 p-1 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* User info */}
        <div className="pt-14">
          {/* Colored Username */}
          <h2 
            className={cn(
              'text-xl font-bold',
              isAdministrator && 'font-extrabold'
            )}
            style={roleColor ? { color: roleColor } : undefined}
          >
            {displayName}
          </h2>
          
          {/* Global username (if nickname exists) */}
          {serverNickname && (
            <p className="text-sm text-text-muted mt-0.5">{user.name}</p>
          )}

          {/* Status */}
          <div className="flex items-center gap-2 mt-1">
            <div className={cn('flex items-center gap-1.5', statusColors[user.status])}>
              <div className={cn(
                'w-2.5 h-2.5 rounded-full',
                user.status === 'online' && 'bg-status-online',
                user.status === 'idle' && 'bg-status-idle',
                user.status === 'dnd' && 'bg-status-dnd',
                user.status === 'offline' && 'bg-status-offline',
              )} />
              <span className="text-sm">{statusText[user.status]}</span>
            </div>
            
            {user.status === 'offline' && user.lastSeen && (
              <span className="text-xs text-text-muted">
                • Last seen {formatLastSeen(user.lastSeen)}
              </span>
            )}
          </div>

          {/* Role badges row */}
          {sortedRoles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {sortedRoles.map((role) => (
                <div
                  key={role.id}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2 py-0.5 rounded',
                    'text-xs font-medium',
                    'border',
                  )}
                  style={{
                    backgroundColor: `${role.color}20`,
                    borderColor: `${role.color}40`,
                    color: role.color,
                  }}
                >
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: role.color }}
                  />
                  <span>{role.name}</span>
                </div>
              ))}
            </div>
          )}

          {/* Divider */}
          <div className="my-4 h-px bg-border-primary" />

          {/* Server nickname section */}
          {serverId && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold uppercase text-text-muted">
                  Server Nickname
                </h3>
                {!isEditingNickname && (isOwnProfile || canManageMembers) && (
                  <button
                    onClick={() => setIsEditingNickname(true)}
                    className="p-1 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
                    title="Edit nickname"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              
              {isEditingNickname ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={nicknameInput}
                    onChange={(e) => setNicknameInput(e.target.value)}
                    placeholder="Enter nickname"
                    maxLength={USER_LIMITS.MAX_USERNAME_LENGTH}
                    className="flex-1"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveNickname}
                    disabled={isSavingNickname}
                    className="p-1.5 text-green-primary hover:bg-green-primary/10 rounded transition-colors"
                    title="Save"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleCancelNickname}
                    className="p-1.5 text-text-secondary hover:bg-bg-hover rounded transition-colors"
                    title="Cancel"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <p className="text-sm text-text-primary">
                  {serverNickname || <span className="text-text-muted italic">No nickname set</span>}
                </p>
              )}
            </div>
          )}

          {/* Member since */}
          {user.joinedAt && (
            <div className="mb-4">
              <h3 className="text-xs font-semibold uppercase text-text-muted mb-1">
                Member Since
              </h3>
              <p className="text-sm text-text-secondary">
                {user.joinedAt.toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          )}

          {/* Roles section - available for own profile and others */}
          {serverId && canManageRoles && (
            <>
              {/* Divider before roles */}
              <div className="my-4 h-px bg-border-primary" />
              <div className="mb-4">
                <h3 className="text-xs font-semibold uppercase text-text-muted mb-2">
                  {isOwnProfile ? 'My Roles' : 'Roles'}
                </h3>
                {isLoadingRoles ? (
                  <div className="text-xs text-text-muted">Loading roles...</div>
                ) : (
                  <RolesSubmenu
                    serverId={serverId}
                    userId={user.id}
                    currentUserRoles={currentUserRoles}
                    userRoles={userRoles}
                    onRoleToggle={handleRoleToggle}
                  />
                )}
              </div>
            </>
          )}

          {/* Divider before moderation */}
          {serverId && !isOwnProfile && (canKick || canBan || canTimeout) && (
            <div className="my-4 h-px bg-border-primary" />
          )}

          {/* Moderation Actions - only for other users */}
          {serverId && !isOwnProfile && (canKick || canBan || canTimeout) && (
            <div className="mb-4">
              <h3 className="text-xs font-semibold uppercase text-text-muted mb-2">
                Moderation
              </h3>
              <div className="flex flex-col gap-2">
                {/* Timeout */}
                {canTimeout && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTimeout}
                    disabled={isTimingOut}
                    className="w-full justify-start"
                  >
                    <Clock className="w-4 h-4 mr-2" />
                    {isTimingOut ? 'Timing out...' : 'Timeout'}
                  </Button>
                )}
                
                {/* Kick */}
                {canKick && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleKick}
                    disabled={isKicking}
                    className="w-full justify-start"
                  >
                    <UserX className="w-4 h-4 mr-2" />
                    {isKicking ? 'Kicking...' : 'Kick'}
                  </Button>
                )}
                
                {/* Ban */}
                {canBan && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleBan}
                    disabled={isBanning}
                    className="w-full justify-start"
                  >
                    <Ban className="w-4 h-4 mr-2" />
                    {isBanning ? 'Banning...' : 'Ban'}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Divider before actions */}
          <div className="my-4 h-px bg-border-primary" />

          {/* Actions */}
          <div className="flex flex-col gap-2">
            {/* Send message button */}
            {!isOwnProfile && onSendMessage && (
              <Button
                onClick={async () => {
                  setIsSendingMessage(true);
                  try {
                    await onSendMessage(user.id);
                    onClose();
                  } catch (err) {
                    console.error('Failed to send message:', err);
                  } finally {
                    setIsSendingMessage(false);
                  }
                }}
                disabled={isSendingMessage}
                className="w-full"
              >
                {isSendingMessage ? 'Creating DM...' : 'Send Message'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
