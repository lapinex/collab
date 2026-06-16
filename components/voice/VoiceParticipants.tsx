'use client';

import { Avatar } from '@/components/profile/Avatar';
import { cn } from '@/lib/utils';
import { useServerMembers } from '@/hooks/serverView';
import { getRoleColor, hasAdministratorPermission, groupUsersByRole } from '@/lib/utils/roles';
import type { Role } from '@/types/server';

interface VoiceParticipant {
  id: string; // participant.identity (unique per session)
  userId?: string | null; // from metadata (for identifying current user)
  name: string; // from participant.name or metadata.nickname
  avatarUrl: string | null; // from metadata.avatar
  isSpeaking?: boolean;
  isMuted?: boolean;
}

interface VoiceParticipantsProps {
  participants: VoiceParticipant[];
  currentUserId?: string;
  serverId?: string; // For role-based coloring and grouping
  className?: string;
}

export function VoiceParticipants({
  participants,
  currentUserId,
  serverId,
  className,
}: VoiceParticipantsProps) {
  const { data: membersData } = useServerMembers(serverId ?? null);
  const serverMembers = serverId ? (membersData ?? []) : [];

  const getUserRoles = (userId: string | null | undefined): Role[] => {
    if (!userId || !serverId) return [];
    const m = serverMembers.find((x) => x.id === userId);
    if (!m?.roles?.length) return [];
    return m.roles.map((r) => ({
      id: r.id,
      serverId,
      name: r.name,
      color: r.color,
      position: r.position,
      permissions: BigInt(0),
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  };
  
  // Group participants by role if serverId is provided
  const groups = serverId && participants.length > 0
    ? groupUsersByRole(
        participants.map(p => ({ userId: p.userId || '', userName: p.name })),
        (userId) => getUserRoles(userId)
      )
    : [{ role: null, users: participants.map(p => ({ userId: p.userId || '', userName: p.name })) }];
  
  if (participants.length === 0) {
    return (
      <div className={cn('p-4 text-center text-text-muted text-sm', className)}>
        No one else is in this voice channel
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {groups.map((group) => {
        if (group.users.length === 0) return null;
        
        const roleName = group.role?.name || 'Members';
        const roleColor = group.role?.color || null;
        
        return (
          <div key={group.role?.id || 'no-role'}>
            {/* Role header */}
            {serverId && (
              <h5 
                className="text-xs font-semibold uppercase text-text-muted px-2 mb-1.5"
                style={roleColor ? { color: roleColor } : undefined}
              >
                {roleName}
              </h5>
            )}
            
            {/* Participants in this role group */}
            <div className="space-y-2">
              {group.users.map((groupUser) => {
                const participant = participants.find(p => (p.userId || '') === groupUser.userId);
                if (!participant) return null;
                
                const userRoles = getUserRoles(participant.userId);
                const participantRoleColor = getRoleColor(userRoles);
                const isAdministrator = hasAdministratorPermission(userRoles);
                
                // Use userId from metadata if available, otherwise fall back to id comparison
                const isCurrentUser = participant.userId 
                  ? participant.userId === currentUserId 
                  : participant.id === currentUserId;
                
                return (
                  <div
                    key={participant.id}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-md',
                      'transition-colors duration-150',
                      participant.isSpeaking
                        ? 'bg-green-primary/10 border border-green-primary/20'
                        : 'hover:bg-bg-hover'
                    )}
                  >
                    {/* Avatar with speaking indicator */}
                    <div className="relative">
                      <Avatar
                        src={participant.avatarUrl}
                        name={participant.name}
                        size="md"
                        status="online"
                        showStatus
                        className={cn(
                          participant.isSpeaking && 'ring-2 ring-green-primary ring-offset-2 ring-offset-bg-secondary'
                        )}
                      />
                      {participant.isSpeaking && (
                        <div className="absolute inset-0 rounded-full bg-green-primary/30 animate-ping" />
                      )}
                    </div>

                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      <div 
                        className={cn(
                          'text-sm font-medium truncate',
                          isAdministrator && 'font-bold'
                        )}
                        style={participantRoleColor ? { color: participantRoleColor } : undefined}
                      >
                        {participant.name}
                        {isCurrentUser && (
                          <span className="ml-1 text-xs text-text-muted">(you)</span>
                        )}
                      </div>
                      {participant.isMuted && (
                        <div className="text-xs text-text-muted flex items-center gap-1">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M11 5L6 9H2v6h4l5 4V5z" />
                            <line x1="23" y1="9" x2="17" y2="15" />
                            <line x1="17" y1="9" x2="23" y2="15" />
                          </svg>
                          Muted
                        </div>
                      )}
                    </div>

                    {/* Status indicators */}
                    <div className="flex items-center gap-2">
                      {participant.isMuted && (
                        <div className="w-2 h-2 rounded-full bg-text-muted" title="Muted" />
                      )}
                      {participant.isSpeaking && !participant.isMuted && (
                        <div className="w-2 h-2 rounded-full bg-green-primary animate-pulse" title="Speaking" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

