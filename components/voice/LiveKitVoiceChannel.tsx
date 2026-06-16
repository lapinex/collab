'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Mic, MicOff, Headphones, HeadphonesIcon, Settings, ChevronDown, Monitor, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover } from '@/components/ui/popover';
import { VoiceSettingsDialog } from '@/components/voice/VoiceSettingsDialog';
import { ScreenShareView } from '@/components/voice/ScreenShareView';
import { useVoiceConnection } from '@/contexts/VoiceConnectionManager';
import { useParticipants } from '@/hooks/useParticipants';
import { useServerMembers } from '@/hooks/serverView';
import { useChannelPermissions } from '@/hooks/useChannelPermissions';
import { getRoleColor, hasAdministratorPermission, groupUsersByRole } from '@/lib/utils/roles';
import { cn } from '@/lib/utils';
import type { Role } from '@/types/server';

interface LiveKitVoiceChannelProps {
  channelId: string;
  channelName: string;
  currentUserId: string;
  serverId?: string; // For role-based coloring and grouping
}

export function LiveKitVoiceChannel({
  channelId,
  channelName,
  currentUserId,
  serverId,
}: LiveKitVoiceChannelProps) {
  const { participants } = useParticipants(channelId);
  const {
    connectionState,
    isMuted,
    isDeafened,
    isScreenSharing,
    screenTrack,
    screenOwner,
    audioDevices,
    selectedMicId,
    selectedSpeakerId,
    toggleMute,
    toggleDeafen,
    toggleScreenShare,
    switchMic,
    switchSpeaker,
    getRoom,
  } = useVoiceConnection();
  const { permissions: channelPerms } = useChannelPermissions(channelId, serverId ?? null, currentUserId);
  const canMuteMembers = channelPerms.canMuteMembers;
  const canDeafenMembers = channelPerms.canDeafenMembers;

  const screenParticipantSid = screenOwner?.sid ?? null;

  const [showMicPopover, setShowMicPopover] = useState(false);
  const [showHeadphonesPopover, setShowHeadphonesPopover] = useState(false);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [showScreenShareOverlay, setShowScreenShareOverlay] = useState(false);

  const isConnected = connectionState === 'connected';

  useEffect(() => {
    if (!screenParticipantSid) setShowScreenShareOverlay(false);
  }, [screenParticipantSid]);

  const { data: membersData } = useServerMembers(serverId ?? null);
  const serverMembers = serverId ? (membersData ?? []) : [];

  const getUserRoles = (userId: string | null | undefined): Role[] => {
    if (!userId || !serverId) return [];
    const m = serverMembers.find((x) => x.id === userId);
    if (!m?.roles?.length) return [];
    return m.roles.map((r) => ({
      id: r.id,
      serverId: serverId!,
      name: r.name,
      color: r.color,
      position: r.position,
      permissions: BigInt(0),
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  };
  
  // Group participants by role if serverId is provided (participants from VoicePresenceStore only)
  const participantGroups = serverId && participants.length > 0
    ? groupUsersByRole(
        participants.map(p => ({ userId: p.userId || '', userName: p.userName })),
        (userId) => getUserRoles(userId)
      )
    : [{ role: null, users: participants.map(p => ({ userId: p.userId || '', userName: p.userName })) }];

  const room = getRoom();
  const participantCount = participants.length;

  return (
    <div className="flex-1 flex flex-col bg-bg-secondary">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border-primary">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔊</span>
          <h3 className="font-semibold text-text-primary">{channelName}</h3>
          {isConnected && (
            <span className="text-xs text-green-primary bg-green-primary/20 px-2 py-0.5 rounded">
              Connected
            </span>
          )}
        </div>
        <p className="text-sm text-text-muted mt-1">
          {isConnected
            ? `${participantCount} ${participantCount === 1 ? 'participant' : 'participants'}`
            : connectionState === 'connecting'
              ? 'Connecting...'
              : 'Disconnected'}
        </p>
      </div>

      {/* Participants list */}
      <div className="flex-1 overflow-y-auto p-4">
        {!isConnected ? (
          <div className="flex items-center justify-center h-full min-h-[320px]">
            <div className="w-full max-w-xl rounded-xl border border-border-primary bg-bg-tertiary p-8 text-center shadow-elev-1">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-bg-quaternary text-2xl">
                {connectionState === 'connecting' ? '🔄' : '🔊'}
              </div>
              <div className="text-lg font-semibold text-text-primary">
                {connectionState === 'connecting' ? 'Connecting to voice…' : 'Voice disconnected'}
              </div>
              <p className="mt-2 text-sm text-text-muted">
                {connectionState === 'connecting'
                  ? 'Waiting for LiveKit room and participants.'
                  : 'Reconnect or rejoin the voice channel to continue.'}
              </p>
            </div>
          </div>
        ) : participants.length === 0 ? (
          <div className="flex items-center justify-center h-full min-h-[320px]">
            <div className="w-full max-w-xl rounded-xl border border-border-primary bg-bg-tertiary p-8 text-center shadow-elev-1">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-bg-quaternary text-2xl">
                👤
              </div>
              <div className="text-lg font-semibold text-text-primary">No participants yet</div>
              <p className="mt-2 text-sm text-text-muted">
                Stay in the channel and wait for others to join.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {participantGroups.map((group) => {
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
                      const isCurrentUser = participant.userId === currentUserId;
                      
                      return (
                        <div
                          key={participant.userId}
                          className={cn(
                            'flex items-center gap-3 p-3 rounded-lg',
                            'bg-bg-tertiary border border-border-primary',
                            participant.isSpeaking && 'border-green-primary bg-green-primary/10'
                          )}
                        >
                          {participant.avatarUrl ? (
                            <Image
                              src={participant.avatarUrl}
                              alt={participant.userName}
                              width={40}
                              height={40}
                              sizes="40px"
                              className={cn(
                                'w-10 h-10 rounded-full object-cover',
                                participant.isSpeaking && 'ring-4 ring-green-500 animate-pulse'
                              )}
                              unoptimized={participant.avatarUrl.startsWith('data:') || participant.avatarUrl.startsWith('/media/')}
                            />
                          ) : (
                            <div className={cn(
                              'w-10 h-10 rounded-full bg-green-primary/20 flex items-center justify-center text-green-primary font-semibold',
                              participant.isSpeaking && 'ring-4 ring-green-500 animate-pulse'
                            )}>
                              {participant.userName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1">
                            <div 
                              className={cn(
                                'font-medium flex items-center gap-2',
                                isAdministrator && 'font-bold'
                              )}
                              style={participantRoleColor ? { color: participantRoleColor } : undefined}
                            >
                              {participant.userName}
                              {isCurrentUser && ' (You)'}
                              {/* Screen share from PresenceStore only */}
                              {participant.isScreenSharing && (
                                <button
                                  type="button"
                                  onClick={() => setShowScreenShareOverlay(true)}
                                  className="text-xs font-medium text-green-primary hover:text-green-600 hover:underline cursor-pointer"
                                >
                                  [ В эфире ]
                                </button>
                              )}
                            </div>
                            <div className="text-xs text-text-muted flex items-center gap-1.5">
                              {participant.isMuted ? (
                                <MicOff className="w-3.5 h-3.5 text-danger flex-shrink-0" aria-label="Muted" />
                              ) : (
                                <Mic className="w-3.5 h-3.5 text-text-muted flex-shrink-0" aria-label="Speaking" />
                              )}
                              {participant.isDeafened ? (
                                <HeadphonesIcon className="w-3.5 h-3.5 text-danger flex-shrink-0" aria-label="Deafened" />
                              ) : null}
                              <span>
                                {participant.isMuted ? 'Muted' : participant.isDeafened ? 'Deafened' : 'Speaking'}
                              </span>
                            </div>
                          </div>
                          {!isCurrentUser && (canMuteMembers || canDeafenMembers) && (
                            <div className="flex items-center gap-1">
                              {canMuteMembers && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-text-muted hover:text-danger"
                                  title={participant.isMuted ? 'Unmute' : 'Mute member'}
                                  onClick={async () => {
                                    const action = participant.isMuted ? 'unmute' : 'mute';
                                    const res = await fetch('/api/voice/moderation', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      credentials: 'include',
                                      body: JSON.stringify({
                                        targetUserId: participant.userId,
                                        channelId,
                                        action,
                                      }),
                                    });
                                    if (!res.ok) console.error('[LiveKitVoiceChannel] mute failed:', await res.text());
                                  }}
                                >
                                  <MicOff className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              {canDeafenMembers && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-text-muted hover:text-danger"
                                  title={participant.isDeafened ? 'Undeafen' : 'Deafen member'}
                                  onClick={async () => {
                                    const action = participant.isDeafened ? 'undeafen' : 'deafen';
                                    const res = await fetch('/api/voice/moderation', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      credentials: 'include',
                                      body: JSON.stringify({
                                        targetUserId: participant.userId,
                                        channelId,
                                        action,
                                      }),
                                    });
                                    if (!res.ok) console.error('[LiveKitVoiceChannel] deafen failed:', await res.text());
                                  }}
                                >
                                  <Headphones className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="p-4 border-t border-border-primary">
        <div className="flex items-center justify-center gap-2">
          {/* Mic section */}
          <div className="flex items-center gap-1">
            <Button
              variant={isMuted ? 'destructive' : 'outline'}
              size="icon"
              onClick={toggleMute}
              disabled={!isConnected}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </Button>
            <Popover
              open={showMicPopover}
              onOpenChange={setShowMicPopover}
              side="top"
              align="start"
              content={
                <div className="py-1">
                  <div className="text-xs font-semibold text-text-secondary mb-2 px-2">Microphones</div>
                  {audioDevices.input.length === 0 ? (
                    <div className="text-xs text-text-muted px-2 py-1">No microphones found</div>
                  ) : (
                    audioDevices.input.map((device) => (
                      <button
                        key={device.deviceId}
                        onClick={async () => {
                          try {
                            await switchMic(device.deviceId);
                            setShowMicPopover(false);
                          } catch (error) {
                            console.error('[LiveKitVoiceChannel] Failed to switch microphone:', error);
                          }
                        }}
                        className={cn(
                          'w-full text-left px-2 py-1.5 text-sm rounded hover:bg-bg-hover transition-colors',
                          selectedMicId === device.deviceId && 'bg-green-primary/20 text-green-primary'
                        )}
                      >
                        {device.label || device.deviceId}
                      </button>
                    ))
                  )}
                </div>
              }
            >
              <Button
                variant="ghost"
                size="icon"
                disabled={!isConnected}
                title="Select microphone"
                className="h-9 w-9"
              >
                <ChevronDown className="w-4 h-4" />
              </Button>
            </Popover>
          </div>

          {/* Headphones section */}
          <div className="flex items-center gap-1">
            <Button
              variant={isDeafened ? 'destructive' : 'outline'}
              size="icon"
              onClick={toggleDeafen}
              disabled={!isConnected}
              title={isDeafened ? 'Undeafen' : 'Deafen'}
            >
              <Headphones className="w-4 h-4" />
            </Button>
            <Popover
              open={showHeadphonesPopover}
              onOpenChange={setShowHeadphonesPopover}
              side="top"
              align="start"
              content={
                <div className="py-1">
                  <div className="text-xs font-semibold text-text-secondary mb-2 px-2">Speakers/Headphones</div>
                  {audioDevices.output.length === 0 ? (
                    <div className="text-xs text-text-muted px-2 py-1">No speakers found</div>
                  ) : (
                    audioDevices.output.map((device) => (
                      <button
                        key={device.deviceId}
                        onClick={async () => {
                          try {
                            await switchSpeaker(device.deviceId);
                            setShowHeadphonesPopover(false);
                          } catch (error) {
                            console.error('[LiveKitVoiceChannel] Failed to switch speaker:', error);
                          }
                        }}
                        className={cn(
                          'w-full text-left px-2 py-1.5 text-sm rounded hover:bg-bg-hover transition-colors',
                          selectedSpeakerId === device.deviceId && 'bg-green-primary/20 text-green-primary'
                        )}
                      >
                        {device.label || device.deviceId}
                      </button>
                    ))
                  )}
                </div>
              }
            >
              <Button
                variant="ghost"
                size="icon"
                disabled={!isConnected}
                title="Select headphones/speakers"
                className="h-9 w-9"
              >
                <ChevronDown className="w-4 h-4" />
              </Button>
            </Popover>
          </div>

          {/* Screen Share button */}
          <Button
            variant={isScreenSharing ? 'destructive' : 'outline'}
            size="icon"
            onClick={toggleScreenShare}
            disabled={!isConnected}
            title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
            className="h-9 w-9"
          >
            <Monitor className="w-4 h-4" />
          </Button>

          {/* Voice Settings button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowVoiceSettings(true)}
            disabled={!isConnected}
            title="Voice Settings"
            className="h-9 w-9"
          >
            <Settings className="w-4 h-4" />
          </Button>

        </div>
      </div>

      {/* Screen Share overlay (Discord-style: open on "В эфире" click) */}
      {showScreenShareOverlay && screenParticipantSid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="relative w-full max-w-4xl rounded-lg overflow-hidden bg-bg-primary border border-border-primary shadow-xl">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 z-10 bg-bg-primary/80 hover:bg-bg-secondary"
              onClick={() => setShowScreenShareOverlay(false)}
              title="Close"
            >
              <X className="w-5 h-5" />
            </Button>
            {screenTrack && screenOwner ? (
              <ScreenShareView screenTrack={screenTrack} screenOwner={screenOwner} />
            ) : (
              <div className="flex flex-col items-center justify-center py-16 px-8 text-text-muted">
                <div className="w-10 h-10 border-2 border-green-primary border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-sm">Подключение к демонстрации экрана...</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Voice Settings Dialog */}
      <VoiceSettingsDialog
        isOpen={showVoiceSettings}
        onClose={() => setShowVoiceSettings(false)}
        room={room}
        isConnected={isConnected}
      />
    </div>
  );
}
