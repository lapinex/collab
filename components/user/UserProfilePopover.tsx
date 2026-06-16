'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUserProfileContext } from '@/contexts/UserProfileContext';
import { useUserProfile, useInvalidateUserProfile } from '@/hooks/useUserProfile';
import { useAuth } from '@/hooks/useAuth';
import { Avatar } from '@/components/profile/Avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  MessageCircle,
  UserPlus,
  UserMinus,
  UserCheck,
  X,
  Ban,
  UserCog,
  MoreHorizontal,
  UserX,
  Pencil,
  Check,
} from 'lucide-react';
import type { UserProfileDTO } from '@/lib/users/dto';
import { USER_LIMITS } from '@/lib/constants';
import { apiPost, apiDelete, apiPut } from '@/lib/api-client';
import { useServerPermissions } from '@/hooks/useServerPermissions';
import { Input } from '@/components/ui/input';
import { getDMSession } from '@/lib/dm/DMSession';
import type { PresenceStatus } from '@/components/profile/Avatar';

const statusText: Record<string, string> = {
  online: 'Online',
  idle: 'Idle',
  dnd: 'Do Not Disturb',
  offline: 'Offline',
};

const statusColors: Record<string, string> = {
  online: 'bg-status-online',
  idle: 'bg-status-idle',
  dnd: 'bg-status-dnd',
  offline: 'bg-status-offline',
};

const POPOVER_WIDTH = 336;
const GAP = 8;

export function UserProfilePopover() {
  const { userId, serverId, anchor, isOpen, closeUserProfile } = useUserProfileContext();
  const { user: currentUser } = useAuth();
  const { data: profile, isLoading, error } = useUserProfile(userId, serverId);
  const invalidateProfile = useInvalidateUserProfile();
  const [isLoadingAction, setIsLoadingAction] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left?: number; right?: number; top: number } | null>(null);

  const currentUserId = currentUser?.id ?? null;
  const isOwnProfile = currentUserId === userId;

  useEffect(() => {
    if (!isOpen) return;
    if (anchor) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const estHeight = 400;
      let top = anchor.y - estHeight / 2;
      if (top < GAP) top = GAP;
      if (top + estHeight > vh - GAP) top = vh - estHeight - GAP;
      if (anchor.side === 'right') {
        const left = anchor.x + GAP;
        setPosition({ left: Math.min(left, vw - POPOVER_WIDTH - GAP), top });
      } else {
        const right = vw - anchor.x + GAP;
        setPosition({ right: Math.min(right, vw - POPOVER_WIDTH - GAP), top });
      }
    } else {
      setPosition({ right: 16, top: 64 });
    }
  }, [isOpen, anchor]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (contentRef.current?.contains(e.target as Node)) return;
      const target = e.target as HTMLElement;
      if (target.closest('[data-user-profile-trigger]')) return;
      closeUserProfile();
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeUserProfile();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, closeUserProfile]);

  if (!isOpen || !userId) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 pointer-events-none">
      <div
        className="pointer-events-auto w-[336px] max-w-[calc(100vw-32px)] fixed z-50"
        style={{
          maxHeight: 'calc(100vh - 2rem)',
          ...(position ?? { right: 16, top: 64 }),
        }}
        ref={contentRef}
      >
        <div
          className={cn(
            'rounded-lg border border-border-primary bg-bg-secondary shadow-xl',
            'overflow-hidden overflow-y-auto',
            'animate-in fade-in-0 slide-in-from-right-4 duration-200',
            'transition-all hover:shadow-2xl'
          )}
        >
          <PopoverContent
            profile={profile}
            isLoading={isLoading}
            error={error}
            currentUserId={currentUserId}
            serverId={serverId}
            isOwnProfile={isOwnProfile}
            isLoadingAction={isLoadingAction}
            setIsLoadingAction={setIsLoadingAction}
            closeUserProfile={closeUserProfile}
            invalidateProfile={invalidateProfile}
            onOpenEditProfile={() => window.dispatchEvent(new CustomEvent('open-user-settings'))}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}

interface PopoverContentProps {
  profile: UserProfileDTO | undefined;
  isLoading: boolean;
  error: Error | null;
  currentUserId: string | null;
  serverId: string | null;
  isOwnProfile: boolean;
  isLoadingAction: string | null;
  setIsLoadingAction: (s: string | null) => void;
  closeUserProfile: () => void;
  invalidateProfile: (userId: string, serverId?: string | null) => void;
  onOpenEditProfile?: () => void;
}

function PopoverContent({
  profile,
  isLoading,
  error,
  currentUserId,
  serverId,
  isOwnProfile,
  isLoadingAction,
  setIsLoadingAction,
  closeUserProfile,
  invalidateProfile,
  onOpenEditProfile,
}: PopoverContentProps) {
  const { permissions: serverPerms } = useServerPermissions(serverId);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setNicknameInput(profile?.serverNickname ?? ''); }, [profile?.serverNickname]);
  useEffect(() => {
    if (!showMoreMenu) return;
    const close = (e: MouseEvent) => {
      if (moreMenuRef.current?.contains(e.target as Node)) return;
      setShowMoreMenu(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showMoreMenu]);

  const roleColor =
    profile?.rolesInServer && profile.rolesInServer.length > 0
      ? profile.rolesInServer[0]?.roleColor ?? undefined
      : undefined;

  const handleAction = async (
    key: string,
    fn: () => Promise<void>
  ) => {
    setIsLoadingAction(key);
    try {
      await fn();
      if (profile) invalidateProfile(profile.id, serverId);
    } finally {
      setIsLoadingAction(null);
    }
  };

  const handleMessage = async () => {
    if (!currentUserId || !profile) return;
    try {
      const dmSession = getDMSession();
      const ch = await dmSession.createOrGetChannel(profile.id);
      closeUserProfile();
      dmSession.setActiveDm(ch.id);
    } catch (err) {
      console.error('Failed to create DM:', err);
    }
  };

  const handleEditProfile = () => {
    closeUserProfile();
    onOpenEditProfile?.();
  };

  if (isLoading) {
    return (
      <div className="p-6 flex flex-col items-center gap-4">
        <div className="w-20 h-20 rounded-full bg-bg-tertiary animate-pulse" />
        <div className="h-6 w-32 bg-bg-tertiary rounded animate-pulse" />
        <div className="h-4 w-24 bg-bg-tertiary rounded animate-pulse" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="p-6 text-center text-text-muted text-sm">
        Failed to load profile
      </div>
    );
  }

  const presenceStatus = profile.presence as PresenceStatus;
  const canModerate = serverId && !isOwnProfile && (serverPerms.canKickMembers || serverPerms.canBanMembers || serverPerms.canManageMembers);
  const displayName = (serverId && profile.serverNickname) ? profile.serverNickname : profile.username;

  return (
    <>
      {/* Header with close button */}
      <div className="relative h-20 bg-gradient-to-br from-green-primary/20 to-green-dark/20" />
      <button
        onClick={closeUserProfile}
        className="absolute top-3 right-3 p-1.5 rounded-full text-text-secondary hover:text-text-primary hover:bg-bg-hover/80 transition-colors"
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>

      <div className="relative px-4 pb-4 -mt-10">
        {/* Avatar + Add Friend top-right */}
        <div className="flex justify-center -mt-14 mb-2 relative">
          <div
            className={cn('p-1.5 bg-bg-secondary rounded-full shadow-lg', isOwnProfile && 'cursor-pointer hover:ring-2 hover:ring-green-primary/50')}
            onClick={isOwnProfile ? handleEditProfile : undefined}
          >
            <Avatar
              src={profile.avatarUrl}
              name={profile.username}
              size="xl"
              status={presenceStatus}
              showStatus
            />
          </div>
          {/* Add Friend button top-right of avatar */}
          {!isOwnProfile && !profile.isBlocked && (
            <div className="absolute -top-2 -right-2">
              <FriendButtonCompact
                profile={profile}
                isLoadingAction={isLoadingAction}
                onAction={handleAction}
              />
            </div>
          )}
        </div>

        {/* Username / display name with role color */}
        <h2
          className="text-center text-xl font-bold truncate"
          style={roleColor ? { color: roleColor } : { color: 'var(--green-primary)' }}
        >
          {displayName}
        </h2>
        {serverId && profile.serverNickname && (
          <p className="text-center text-sm text-text-muted truncate">{profile.username}</p>
        )}

        {/* Status */}
        <div className="flex items-center justify-center gap-1.5 mt-1">
          <div
            className={cn(
              'w-2.5 h-2.5 rounded-full',
              statusColors[profile.presence] ?? statusColors.offline
            )}
          />
          <span className="text-sm text-text-secondary">
            {statusText[profile.presence] ?? 'Offline'}
          </span>
        </div>

        {/* Mutual servers & friends */}
        {(profile.mutualServersCount > 0 || profile.mutualFriendsCount > 0) && (
          <div className="flex justify-center gap-4 mt-3 text-xs text-text-muted">
            {profile.mutualServersCount > 0 && (
              <span>Mutual Servers: {profile.mutualServersCount}</span>
            )}
            {profile.mutualFriendsCount > 0 && (
              <span>Mutual Friends: {profile.mutualFriendsCount}</span>
            )}
          </div>
        )}

        {/* Server nickname (own profile or moderator) */}
        {serverId && (isOwnProfile || serverPerms.canManageMembers) && (
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase text-text-muted mb-2">Server Nickname</h3>
            {isEditingNickname ? (
              <div className="flex gap-2">
                <Input
                  value={nicknameInput}
                  onChange={(e) => setNicknameInput(e.target.value)}
                  placeholder="Nickname"
                  maxLength={USER_LIMITS.MAX_USERNAME_LENGTH}
                  className="flex-1"
                  autoFocus
                />
                <Button size="sm" onClick={async () => {
                  if (!profile || !serverId) return;
                  setIsLoadingAction('nick');
                  try {
                    await apiPut(`/api/servers/${serverId}/members/${profile.id}/nickname`, { nickname: nicknameInput.trim() || null });
                    setIsEditingNickname(false);
                    invalidateProfile(profile.id, serverId);
                  } finally { setIsLoadingAction(null); }
                }} disabled={!!isLoadingAction}>
                  <Check className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setIsEditingNickname(false); setNicknameInput(profile.serverNickname ?? ''); }}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-sm text-text-primary">{profile.serverNickname || <span className="text-text-muted italic">No nickname</span>}</p>
                <button onClick={() => setIsEditingNickname(true)} className="p-1 hover:bg-bg-hover rounded">
                  <Pencil className="w-3.5 h-3.5 text-text-muted" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Roles (if serverId) */}
        {serverId && profile.rolesInServer && profile.rolesInServer.length > 0 && (
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase text-text-muted mb-2">Roles</h3>
            <div className="flex flex-wrap gap-1.5">
              {profile.rolesInServer.map((r) => (
                <span
                  key={r.roleId}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border"
                  style={{
                    backgroundColor: r.roleColor ? `${r.roleColor}20` : undefined,
                    borderColor: r.roleColor ? `${r.roleColor}40` : 'var(--border-primary)',
                    color: r.roleColor ?? 'var(--text-secondary)',
                  }}
                >
                  {r.roleColor && (
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: r.roleColor }}
                    />
                  )}
                  {r.roleName}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="my-4 h-px bg-border-primary" />

        {/* Bottom: Roles editor (own profile), Message, More */}
        <div className="flex flex-col gap-2">
          {isOwnProfile ? (
            <Button
                variant="outline"
                className="w-full justify-start gap-2 hover:bg-bg-hover"
                onClick={handleEditProfile}
              >
                <UserCog className="w-4 h-4" />
                Edit Profile
              </Button>
          ) : (
            <>
              {!profile.isBlocked && (
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2 hover:bg-bg-hover transition-colors"
                  onClick={() => handleAction('message', handleMessage)}
                  disabled={!!isLoadingAction}
                >
                  <MessageCircle className="w-4 h-4" />
                  {isLoadingAction === 'message' ? '...' : 'Message'}
                </Button>
              )}

              {canModerate && (
                <div className="relative" ref={moreMenuRef}>
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-2"
                    onClick={() => setShowMoreMenu(!showMoreMenu)}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                    Прочее
                  </Button>
                  {showMoreMenu && (
                    <MoreModerationMenu
                      profile={profile}
                      serverId={serverId}
                      serverPerms={serverPerms}
                      onKick={async () => { setShowMoreMenu(false); await handleAction('kick', async () => { await fetch(`/api/servers/${serverId}/members/${profile.id}/kick`, { method: 'POST', credentials: 'include' }); closeUserProfile(); }); }}
                      onBan={async () => { setShowMoreMenu(false); await handleAction('ban', async () => { await fetch(`/api/servers/${serverId}/members/${profile.id}/ban`, { method: 'POST', credentials: 'include' }); closeUserProfile(); }); }}
                      onNickname={() => { setShowMoreMenu(false); setIsEditingNickname(true); }}
                      onClose={() => setShowMoreMenu(false)}
                    />
                  )}
                </div>
              )}

              <BlockButton
                profile={profile}
                isLoadingAction={isLoadingAction}
                onAction={handleAction}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}

/** Compact Add Friend button for top-right of avatar */
function FriendButtonCompact({
  profile,
  isLoadingAction,
  onAction,
}: {
  profile: UserProfileDTO;
  isLoadingAction: string | null;
  onAction: (key: string, fn: () => Promise<void>) => void;
}) {
  if (profile.isFriend) {
    return (
      <Button size="icon" variant="secondary" className="h-8 w-8 rounded-full" onClick={() => onAction('remove', async () => { await apiDelete(`/api/friends/${profile.id}`); })} disabled={!!isLoadingAction}>
        <UserMinus className="w-4 h-4" />
      </Button>
    );
  }
  if (profile.incomingFriendRequest && profile.friendRequestId) {
    return (
      <div className="flex gap-1">
        <Button size="icon" variant="secondary" className="h-8 w-8 rounded-full" onClick={() => onAction('accept', async () => { await apiPost(`/api/friends/requests/${profile.friendRequestId}/accept`, {}); })} disabled={!!isLoadingAction}>
          <UserCheck className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={() => onAction('decline', async () => { await apiPost(`/api/friends/requests/${profile.friendRequestId}/decline`, {}); })} disabled={!!isLoadingAction}>
          <X className="w-4 h-4" />
        </Button>
      </div>
    );
  }
  if (profile.outgoingFriendRequest && profile.friendRequestId) {
    return (
      <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={() => onAction('cancel', async () => { await apiPost(`/api/friends/requests/${profile.friendRequestId}/cancel`, {}); })} disabled={!!isLoadingAction}>
        <X className="w-4 h-4" />
      </Button>
    );
  }
  return (
    <Button size="icon" variant="secondary" className="h-8 w-8 rounded-full" onClick={() => onAction('add', async () => { await apiPost('/api/friends/requests', { userId: profile.id }); })} disabled={!!isLoadingAction}>
      <UserPlus className="w-4 h-4" />
    </Button>
  );
}

function MoreModerationMenu({
  serverPerms,
  onKick,
  onBan,
  onNickname,
}: {
  profile: UserProfileDTO;
  serverId: string;
  serverPerms: { canKickMembers?: boolean; canBanMembers?: boolean; canManageMembers?: boolean };
  onKick: () => void | Promise<void>;
  onBan: () => void | Promise<void>;
  onNickname: () => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute left-0 top-full mt-1 w-full bg-bg-tertiary border border-border-primary rounded-lg shadow-lg py-1 z-50">
      {serverPerms.canKickMembers && (
        <button onClick={onKick} className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-bg-hover text-sm">
          <UserX className="w-4 h-4" />
          Kick
        </button>
      )}
      {serverPerms.canBanMembers && (
        <button onClick={onBan} className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-bg-hover text-danger text-sm">
          <Ban className="w-4 h-4" />
          Ban
        </button>
      )}
      {serverPerms.canManageMembers && (
        <button onClick={onNickname} className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-bg-hover text-sm">
          <Pencil className="w-4 h-4" />
          Change Nickname
        </button>
      )}
    </div>
  );
}

function BlockButton({
  profile,
  isLoadingAction,
  onAction,
}: {
  profile: UserProfileDTO;
  isLoadingAction: string | null;
  onAction: (key: string, fn: () => Promise<void>) => void;
}) {
  if (profile.isBlocked) {
    return (
      <Button
        variant="ghost"
        className="w-full justify-start gap-2 text-danger hover:bg-danger/10 hover:text-danger"
        onClick={() =>
          onAction('unblock', async () => {
            await apiDelete(`/api/users/me/block/${profile.id}`);
          })
        }
        disabled={!!isLoadingAction}
      >
        <Ban className="w-4 h-4" />
        {isLoadingAction === 'unblock' ? '...' : 'Unblock'}
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      className="w-full justify-start gap-2 text-danger hover:bg-danger/10 hover:text-danger"
      onClick={() =>
        onAction('block', async () => {
          await apiPost('/api/users/me/block', { userId: profile.id });
        })
      }
      disabled={!!isLoadingAction}
    >
      <Ban className="w-4 h-4" />
      {isLoadingAction === 'block' ? '...' : 'Block'}
    </Button>
  );
}
