'use client';

import { memo, useCallback } from 'react';
import { Avatar, PresenceStatus } from '@/components/profile/Avatar';
import { useUserProfileContext } from '@/contexts/UserProfileContext';
import { useUserContextMenu, type VoiceModerationActions } from '@/hooks/useUserContextMenu';
import { useServerPermissions } from '@/hooks/useServerPermissions';
import { usePresenceStore } from '@/stores/presence-store';
import { selectOnlineUserIds } from '@/stores/presence.selectors';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import type { MessageViewParticipant } from '@/lib/messageView/types';
import type { Role } from '@/types/server';
import { getRoleColor } from '@/lib/utils/roles';
import type { VoicePresenceParticipant } from '@/stores/voice-presence-store';
import { MicOff, HeadphonesIcon } from 'lucide-react';

export interface ParticipantWithPresence extends MessageViewParticipant {
  status: PresenceStatus;
  lastSeen?: Date;
  /** For grouping and display; built from roleName/roleColor when present */
  roles?: Role[];
  isScreenSharing?: boolean;
  isMuted?: boolean;
  isDeafened?: boolean;
}

interface ParticipantListProps {
  /** Participants from parent: DM → [currentUser, otherUser], Server → members. null = no channel selected. */
  participants: MessageViewParticipant[] | null;
  currentUserId?: string;
  serverId?: string; // Only for context menu (role management), not for data
  canManageRoles?: boolean;
  /** When set, voice moderation (Mute/Deafen) is available and voice state is shown. */
  voiceChannelId?: string | null;
  /** Must equal voiceChannelId when user is actually in the voice channel. */
  activeVoiceChannelId?: string | null;
  canMuteMembers?: boolean;
  canDeafenMembers?: boolean;
  /** Voice presence for voiceChannelId (muted/deafened state). */
  voicePresence?: VoicePresenceParticipant[];
}

function ParticipantListComponent({
  participants,
  currentUserId,
  serverId,
  canManageRoles = false,
  voiceChannelId = null,
  activeVoiceChannelId = null,
  canMuteMembers = false,
  canDeafenMembers = false,
  voicePresence = [],
}: ParticipantListProps) {
  const { openUserProfile } = useUserProfileContext();
  const onlineUserIds = usePresenceStore(selectOnlineUserIds);
  const { permissions: serverPerms } = useServerPermissions(serverId ?? null);
  const queryClient = useQueryClient();
  const canKick = serverPerms.canKickMembers;
  const canBan = serverPerms.canBanMembers;
  const isVoiceModerationActive =
    !!voiceChannelId && voiceChannelId === activeVoiceChannelId && (canMuteMembers || canDeafenMembers);
  const voiceStateByUserId = new Map(voicePresence.filter((p) => p.userId).map((p) => [p.userId!, p]));

  const handleVoiceModeration = useCallback(
    async (targetUserId: string, action: 'mute' | 'unmute' | 'deafen' | 'undeafen') => {
      if (!voiceChannelId) return;
      const res = await fetch('/api/voice/moderation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ targetUserId, channelId: voiceChannelId, action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error('[ParticipantList] moderation failed:', data?.error ?? res.status);
      }
    },
    [voiceChannelId]
  );

  const handleKick = useCallback(
    async (userId: string) => {
      if (!serverId) return;
      const res = await fetch(`/api/servers/${serverId}/members/${userId}/kick`, { method: 'POST', credentials: 'include' });
      if (res.ok) {
        await queryClient.invalidateQueries({ queryKey: ['server-members', serverId] });
      }
    },
    [serverId, queryClient]
  );
  const handleBan = useCallback(
    async (userId: string) => {
      if (!serverId) return;
      const res = await fetch(`/api/servers/${serverId}/members/${userId}/ban`, { method: 'POST', credentials: 'include' });
      if (res.ok) {
        await queryClient.invalidateQueries({ queryKey: ['server-members', serverId] });
      }
    },
    [serverId, queryClient]
  );

  const participantsWithPresence: ParticipantWithPresence[] = (participants ?? []).map((p) => {
    const roles: Role[] =
      p.roleName != null || p.roleColor != null
        ? [
            {
              id: p.roleName ?? `role-${p.id}`,
              serverId: serverId ?? '',
              name: p.roleName ?? '',
              color: p.roleColor ?? '#99aab5',
              position: 0,
              permissions: BigInt(0),
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]
        : [];
    const status: PresenceStatus = onlineUserIds.includes(p.id) ? 'online' : 'offline';
    const voiceState = voiceStateByUserId.get(p.id);
    return {
      ...p,
      status,
      roles,
      isScreenSharing: voiceState?.isScreenSharing ?? (p as ParticipantWithPresence).isScreenSharing,
      isMuted: voiceState?.isMuted,
      isDeafened: voiceState?.isDeafened,
    };
  });

  const onlineParticipants = participantsWithPresence.filter((p) => p.status === 'online');
  const idleParticipants = participantsWithPresence.filter((p) => p.status === 'idle');
  const dndParticipants = participantsWithPresence.filter((p) => p.status === 'dnd');
  const offlineParticipants = participantsWithPresence.filter((p) => p.status === 'offline');

  const groupByRole = (list: ParticipantWithPresence[]) => {
    const byRole = new Map<string | 'no-role', { role: Role | null; users: ParticipantWithPresence[] }>();
    for (const p of list) {
      const role = p.roles?.[0] ?? null;
      const key = role ? role.id : 'no-role';
      if (!byRole.has(key)) {
        byRole.set(key, { role, users: [] });
      }
      byRole.get(key)!.users.push(p);
    }
    return Array.from(byRole.values());
  };

  const onlineGroups = groupByRole(onlineParticipants);
  const idleGroups = groupByRole(idleParticipants);
  const dndGroups = groupByRole(dndParticipants);
  const offlineGroups = groupByRole(offlineParticipants);

  const handleAvatarClick = (participant: ParticipantWithPresence, e?: React.MouseEvent) => {
    let anchor: { x: number; y: number; side: 'left' } | undefined;
    if (e?.currentTarget) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      anchor = { x: rect.left, y: rect.top + rect.height / 2, side: 'left' };
    }
    openUserProfile(participant.id, serverId ?? undefined, anchor ?? undefined);
  };

  if (participants === null) {
    return (
      <div className="w-60 bg-bg-quaternary p-4 flex flex-col border-l border-border-primary">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-primary mb-4">
          Members
        </h3>
        <p className="text-xs text-text-muted">Select a channel to see members</p>
      </div>
    );
  }

  return (
    <>
      <div className="w-60 bg-bg-quaternary flex flex-col border-l border-border-primary overflow-hidden">
        <div className="p-4 pb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-primary">
            Members — {participantsWithPresence.length}
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {onlineGroups.length > 0 && (
            <div className="mb-4">
              <h4 className="text-xs font-semibold uppercase text-text-muted px-2 mb-2">
                Online — {onlineParticipants.length}
              </h4>
              {onlineGroups.map((group) => (
                <RoleGroup
                  key={group.role?.id ?? 'no-role'}
                  role={group.role}
                  participants={group.users}
                  onAvatarClick={handleAvatarClick}
                  serverId={serverId}
                  currentUserId={currentUserId}
                  canManageRoles={canManageRoles}
                  canKick={canKick}
                  canBan={canBan}
                  onKickClick={handleKick}
                  onBanClick={handleBan}
                  isVoiceModerationActive={isVoiceModerationActive}
                  voiceChannelId={voiceChannelId}
                  currentUserIdForVoice={currentUserId}
                  onVoiceModeration={handleVoiceModeration}
                  canMuteMembers={canMuteMembers}
                  canDeafenMembers={canDeafenMembers}
                />
              ))}
            </div>
          )}

          {idleGroups.length > 0 && (
            <div className="mb-4">
              <h4 className="text-xs font-semibold uppercase text-text-muted px-2 mb-2">
                Idle — {idleParticipants.length}
              </h4>
              {idleGroups.map((group) => (
                <RoleGroup
                  key={group.role?.id ?? 'no-role'}
                  role={group.role}
                  participants={group.users}
                  onAvatarClick={handleAvatarClick}
                  serverId={serverId}
                  currentUserId={currentUserId}
                  canManageRoles={canManageRoles}
                  canKick={canKick}
                  canBan={canBan}
                  onKickClick={handleKick}
                  onBanClick={handleBan}
                  isVoiceModerationActive={isVoiceModerationActive}
                  voiceChannelId={voiceChannelId}
                  currentUserIdForVoice={currentUserId}
                  onVoiceModeration={handleVoiceModeration}
                  canMuteMembers={canMuteMembers}
                  canDeafenMembers={canDeafenMembers}
                />
              ))}
            </div>
          )}

          {dndGroups.length > 0 && (
            <div className="mb-4">
              <h4 className="text-xs font-semibold uppercase text-text-muted px-2 mb-2">
                Do Not Disturb — {dndParticipants.length}
              </h4>
              {dndGroups.map((group) => (
                <RoleGroup
                  key={group.role?.id ?? 'no-role'}
                  role={group.role}
                  participants={group.users}
                  onAvatarClick={handleAvatarClick}
                  serverId={serverId}
                  currentUserId={currentUserId}
                  canManageRoles={canManageRoles}
                  canKick={canKick}
                  canBan={canBan}
                  onKickClick={handleKick}
                  onBanClick={handleBan}
                  isVoiceModerationActive={isVoiceModerationActive}
                  voiceChannelId={voiceChannelId}
                  currentUserIdForVoice={currentUserId}
                  onVoiceModeration={handleVoiceModeration}
                  canMuteMembers={canMuteMembers}
                  canDeafenMembers={canDeafenMembers}
                />
              ))}
            </div>
          )}

          {offlineGroups.length > 0 && (
            <div className="mb-4">
              <h4 className="text-xs font-semibold uppercase text-text-muted px-2 mb-2">
                Offline — {offlineParticipants.length}
              </h4>
              {offlineGroups.map((group) => (
                <RoleGroup
                  key={group.role?.id ?? 'no-role'}
                  role={group.role}
                  participants={group.users}
                  onAvatarClick={handleAvatarClick}
                  serverId={serverId}
                  currentUserId={currentUserId}
                  canManageRoles={canManageRoles}
                  canKick={canKick}
                  canBan={canBan}
                  onKickClick={handleKick}
                  onBanClick={handleBan}
                  isVoiceModerationActive={isVoiceModerationActive}
                  voiceChannelId={voiceChannelId}
                  currentUserIdForVoice={currentUserId}
                  onVoiceModeration={handleVoiceModeration}
                  canMuteMembers={canMuteMembers}
                  canDeafenMembers={canDeafenMembers}
                />
              ))}
            </div>
          )}

          {participantsWithPresence.length === 0 && (
            <p className="text-xs text-text-muted text-center py-4">
              No members in this channel
            </p>
          )}
        </div>
      </div>

    </>
  );
}

interface RoleGroupProps {
  role: Role | null;
  participants: ParticipantWithPresence[];
  onAvatarClick: (participant: ParticipantWithPresence, e?: React.MouseEvent) => void;
  serverId?: string;
  currentUserId?: string;
  canManageRoles?: boolean;
  canKick?: boolean;
  canBan?: boolean;
  onKickClick?: (userId: string) => void;
  onBanClick?: (userId: string) => void;
  isVoiceModerationActive?: boolean;
  voiceChannelId?: string | null;
  currentUserIdForVoice?: string;
  onVoiceModeration?: (userId: string, action: 'mute' | 'unmute' | 'deafen' | 'undeafen') => void;
  canMuteMembers?: boolean;
  canDeafenMembers?: boolean;
}

function RoleGroup({
  role,
  participants,
  onAvatarClick,
  serverId,
  currentUserId,
  canManageRoles,
  canKick,
  canBan,
  onKickClick,
  onBanClick,
  isVoiceModerationActive = false,
  voiceChannelId,
  currentUserIdForVoice,
  onVoiceModeration,
  canMuteMembers = false,
  canDeafenMembers = false,
}: RoleGroupProps) {
  if (participants.length === 0) return null;

  return (
    <div className="mb-2">
      {role && (
        <div
          className="text-xs font-semibold uppercase text-text-muted px-2 mb-1.5 flex items-center gap-1.5"
          style={role.color ? { color: role.color } : undefined}
        >
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: role.color || '#99aab5' }}
          />
          {role.name}
        </div>
      )}
      <div className="space-y-0.5">
        {participants.map((participant) => {
          const isSelf = participant.id === currentUserIdForVoice;
          const voiceModeration: VoiceModerationActions | undefined =
            isVoiceModerationActive && voiceChannelId && !isSelf && onVoiceModeration
              ? {
                  canMute: canMuteMembers,
                  canDeafen: canDeafenMembers,
                  isMuted: participant.isMuted ?? false,
                  isDeafened: participant.isDeafened ?? false,
                  onMute: () => onVoiceModeration(participant.id, 'mute'),
                  onUnmute: () => onVoiceModeration(participant.id, 'unmute'),
                  onDeafen: () => onVoiceModeration(participant.id, 'deafen'),
                  onUndeafen: () => onVoiceModeration(participant.id, 'undeafen'),
                }
              : undefined;
          return (
            <ParticipantItem
              key={participant.id}
              participant={participant}
              onClick={(e) => onAvatarClick(participant, e)}
              serverId={serverId}
              currentUserId={currentUserId}
              canManageRoles={canManageRoles}
              canKick={canKick}
              canBan={canBan}
              onKickClick={onKickClick ? () => onKickClick(participant.id) : undefined}
              onBanClick={onBanClick ? () => onBanClick(participant.id) : undefined}
              voiceModeration={voiceModeration}
            />
          );
        })}
      </div>
    </div>
  );
}

interface ParticipantItemProps {
  participant: ParticipantWithPresence;
  onClick: (e?: React.MouseEvent) => void;
  serverId?: string;
  currentUserId?: string;
  canManageRoles?: boolean;
  canKick?: boolean;
  canBan?: boolean;
  onKickClick?: () => void;
  onBanClick?: () => void;
  voiceModeration?: VoiceModerationActions;
}

function ParticipantItemComponent({
  participant,
  onClick,
  serverId,
  currentUserId,
  canManageRoles = false,
  canKick = false,
  canBan = false,
  onKickClick,
  onBanClick,
  voiceModeration,
}: ParticipantItemProps) {
  const formatLastSeen = (date?: Date) => {
    if (!date) return '';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return 'Long time ago';
  };

  const userRoles = participant.roles ?? [];
  const roleColor = getRoleColor(userRoles) ?? participant.roleColor ?? undefined;
  const isSelf = participant.id === currentUserId;

  const { handleContextMenu, contextMenu } = useUserContextMenu({
    userId: participant.id,
    serverId,
    currentUserId,
    canManageRoles,
    canKick: canKick && !isSelf && !!onKickClick,
    canBan: canBan && !isSelf && !!onBanClick,
    onProfileClick: () => onClick(),
    onKickClick,
    onBanClick,
    voiceModeration,
  });

  return (
    <>
      <button
        onClick={onClick}
        onContextMenu={handleContextMenu}
        className={cn(
          'flex items-center gap-2 w-full px-2 py-1.5 rounded-md',
          'transition-colors duration-150',
          'hover:bg-bg-hover',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-primary',
          participant.status === 'offline' && 'opacity-60',
        )}
      >
        <Avatar
          src={participant.avatar}
          name={participant.username}
          size="sm"
          status={participant.status}
          showStatus
        />
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1">
            <span
              className="text-sm font-medium truncate"
              style={roleColor ? { color: roleColor } : undefined}
            >
              {participant.username}
            </span>
            {participant.isMuted && (
              <MicOff className="w-3.5 h-3.5 text-danger flex-shrink-0" aria-label="Muted" />
            )}
            {participant.isDeafened && (
              <HeadphonesIcon className="w-3.5 h-3.5 text-danger flex-shrink-0" aria-label="Deafened" />
            )}
            {participant.isScreenSharing && (
              <span className="text-xs text-green-primary font-medium">[ В эфире ]</span>
            )}
          </div>
          {participant.roleName != null && participant.roleName !== '' && (
            <span
              className="text-xs truncate block"
              style={{ color: participant.roleColor ?? 'var(--green-primary)' }}
            >
              {participant.roleName}
            </span>
          )}
          {participant.status === 'offline' && participant.lastSeen && (
            <span className="text-xs text-text-muted block">
              {formatLastSeen(participant.lastSeen)}
            </span>
          )}
        </div>
      </button>
      {contextMenu}
    </>
  );
}

const ParticipantItem = memo(ParticipantItemComponent);

export const ParticipantList = memo(ParticipantListComponent);
