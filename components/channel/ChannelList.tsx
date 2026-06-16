'use client';

import { useState, memo, useEffect, useRef, useMemo, useCallback } from 'react';
import Image from 'next/image';
import type { Channel } from '@/types/server';
import { useVoiceConnection } from '@/contexts/VoiceConnectionManager';
import { useLiveVoiceParticipants } from '@/hooks/useLiveVoiceParticipants';
import { useVoicePresenceStore } from '@/stores/voice-presence-store';
import { selectVoiceParticipantsByChannelId } from '@/stores/voice-presence.selectors';
import { cn } from '@/lib/utils';
import { warmupToken } from '@/lib/voice-view/tokenWarmup';
import { warmupLiveKitNetwork } from '@/lib/voice-view/networkWarmup';
import { Popover } from '@/components/ui/popover';
import { Mic, MicOff, Headphones, HeadphonesIcon } from 'lucide-react';
import { ChannelBadge, channelRowBadgeClass } from '@/components/notifications/ChannelBadge';
import { useBadgeStore } from '@/stores/badge-store';
import { selectChannelBadge } from '@/stores/badge.selectors';

interface ChannelListProps {
  channels: Channel[];
  selectedChannelId?: string;
  onSelectChannel: (channelId: string) => void;
  onJoinVoice?: (channelId: string) => void;
  onLeaveVoice?: () => void;
  activeVoiceChannelId?: string;
  isVoiceJoining?: boolean;
  voiceParticipants?: Record<string, { id: string; name: string }[]>; // Legacy, kept for backward compatibility
  onCreateChannel?: () => void;
  serverId?: string;
  currentUserId?: string;
  canMuteMembers?: boolean;
  canDeafenMembers?: boolean;
}

function ChannelListComponent({
  channels,
  selectedChannelId,
  onSelectChannel,
  onJoinVoice,
  onLeaveVoice,
  activeVoiceChannelId,
  isVoiceJoining = false,
  voiceParticipants: _legacyVoiceParticipants = {},
  onCreateChannel,
  serverId,
  currentUserId,
  canMuteMembers = false,
  canDeafenMembers = false,
}: ChannelListProps) {
  const { currentChannelId } = useVoiceConnection();
  const networkWarmupDone = useRef(false);

  const firstVoiceChannelId = channels.find((ch) => ch.type === 'voice')?.id;

  useEffect(() => {
    if (!firstVoiceChannelId || networkWarmupDone.current) return;
    networkWarmupDone.current = true;
    warmupToken(firstVoiceChannelId).then(() => {
      warmupLiveKitNetwork(firstVoiceChannelId);
    });
  }, [firstVoiceChannelId]);

  // Group channels by category and type
  const categories = channels.filter((ch) => ch.type === 'category');
  const textChannels = channels.filter((ch) => ch.type === 'text' && !ch.parentId);
  const voiceChannels = channels.filter((ch) => ch.type === 'voice' && !ch.parentId);
  const announcementChannels = channels.filter((ch) => ch.type === 'announcements' && !ch.parentId);
  const forumChannels = channels.filter((ch) => ch.type === 'forum' && !ch.parentId);

  // Get channels by category
  const getChannelsByCategory = (categoryId: string) => {
    return channels.filter((ch) => ch.parentId === categoryId);
  };

  return (
    <div className="flex flex-col py-3 bg-surface-elevated h-full">
      {/* Text Channels */}
      {(textChannels.length > 0 || onCreateChannel) && (
        <ChannelCategory 
          title="Text Channels"
          onAddClick={onCreateChannel}
          showAddButton={!!onCreateChannel}
        >
          {textChannels.map((channel) => (
            <ChannelItem
              key={channel.id}
              channel={channel}
              isSelected={selectedChannelId === channel.id}
              onSelectChannel={onSelectChannel}
            />
          ))}
        </ChannelCategory>
      )}

      {/* Announcement Channels */}
      {announcementChannels.length > 0 && (
        <ChannelCategory title="Announcements">
          {announcementChannels.map((channel) => (
            <ChannelItem
              key={channel.id}
              channel={channel}
              isSelected={selectedChannelId === channel.id}
              onSelectChannel={onSelectChannel}
            />
          ))}
        </ChannelCategory>
      )}

      {/* Forum Channels */}
      {forumChannels.length > 0 && (
        <ChannelCategory title="Forums">
          {forumChannels.map((channel) => (
            <ChannelItem
              key={channel.id}
              channel={channel}
              isSelected={selectedChannelId === channel.id}
              onSelectChannel={onSelectChannel}
            />
          ))}
        </ChannelCategory>
      )}

      {/* Categories with nested channels */}
      {categories.map((category) => {
        const categoryChannels = getChannelsByCategory(category.id);
        const categoryTextChannels = categoryChannels.filter((ch) => ch.type === 'text');
        const categoryVoiceChannels = categoryChannels.filter((ch) => ch.type === 'voice');
        const categoryAnnouncementChannels = categoryChannels.filter((ch) => ch.type === 'announcements');
        const categoryForumChannels = categoryChannels.filter((ch) => ch.type === 'forum');

        return (
          <ChannelCategory key={category.id} title={category.name}>
            {categoryTextChannels.map((channel) => (
              <ChannelItem
                key={channel.id}
                channel={channel}
                isSelected={selectedChannelId === channel.id}
                onSelectChannel={onSelectChannel}
              />
            ))}
            {categoryAnnouncementChannels.map((channel) => (
              <ChannelItem
                key={channel.id}
                channel={channel}
                isSelected={selectedChannelId === channel.id}
                onSelectChannel={onSelectChannel}
              />
            ))}
            {categoryForumChannels.map((channel) => (
              <ChannelItem
                key={channel.id}
                channel={channel}
                isSelected={selectedChannelId === channel.id}
                onSelectChannel={onSelectChannel}
              />
            ))}
            {categoryVoiceChannels.map((channel) => {
              const isActive = activeVoiceChannelId === channel.id || currentChannelId === channel.id;
              return (
                <VoiceChannelItem
                  key={channel.id}
                  channel={channel}
                  isActive={isActive}
                  isJoining={isVoiceJoining}
                  onJoin={() => onJoinVoice?.(channel.id)}
                  onLeave={() => onLeaveVoice?.()}
                  onMouseEnter={() => warmupToken(channel.id)}
                />
              );
            })}
          </ChannelCategory>
        );
      })}

      {/* Voice Channels */}
      {voiceChannels.length > 0 && (
        <ChannelCategory title="Voice Channels">
          {voiceChannels.map((channel) => {
            const isActive = activeVoiceChannelId === channel.id || currentChannelId === channel.id;
            return (
              <VoiceChannelItem
                key={channel.id}
                channel={channel}
                isActive={isActive}
                isJoining={isVoiceJoining}
                onJoin={() => onJoinVoice?.(channel.id)}
                onLeave={() => onLeaveVoice?.()}
                onMouseEnter={() => warmupToken(channel.id)}
                serverId={serverId}
                currentUserId={currentUserId}
                canMuteMembers={canMuteMembers}
                canDeafenMembers={canDeafenMembers}
              />
            );
          })}
        </ChannelCategory>
      )}

      {channels.length === 0 && (
        <div className="px-3 py-4 text-text-muted text-sm text-center">
          No channels yet
        </div>
      )}
    </div>
  );
}

interface ChannelCategoryProps {
  title: string;
  children: React.ReactNode;
  onAddClick?: () => void;
  showAddButton?: boolean;
}

function ChannelCategory({ title, children, onAddClick, showAddButton }: ChannelCategoryProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="mb-2">
      <div className="flex items-center gap-1 w-full px-3 py-1.5 group">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            'flex items-center gap-1 flex-1',
            'text-xs font-semibold uppercase tracking-wide',
            'text-text-primary hover:text-text-primary',
            'transition-colors duration-150',
          )}
        >
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
            className={cn(
              'transition-transform duration-150',
              isExpanded ? 'rotate-0' : '-rotate-90'
            )}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
          {title}
        </button>
        {showAddButton && onAddClick && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddClick();
            }}
            className={cn(
              'p-0.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-hover',
              'opacity-0 group-hover:opacity-100 transition-opacity',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-primary focus-visible:opacity-100',
            )}
            title={`Create ${title.slice(0, -1)}`}
          >
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
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        )}
      </div>
      
      {isExpanded && (
        <div className="mt-1 space-y-0.5">
          {children}
        </div>
      )}
    </div>
  );
}

interface ChannelItemProps {
  channel: Channel;
  isSelected: boolean;
  onSelectChannel: (channelId: string) => void;
}

function ChannelItemComponent({ channel, isSelected, onSelectChannel }: ChannelItemProps) {
  const badgeSelector = useMemo(() => selectChannelBadge(channel.id), [channel.id]);
  const badge = useBadgeStore(badgeSelector);
  const unread = badge?.unread ?? 0;
  const mentions = badge?.mentions ?? 0;
  const { nameClass } = channelRowBadgeClass(unread, mentions, isSelected);

  const handleClick = useCallback(() => {
    onSelectChannel(channel.id);
  }, [channel.id, onSelectChannel]);

  return (
    <button
      onClick={handleClick}
      className={cn(
        'group relative flex items-center gap-2 w-full px-2 py-1.5 mx-2 rounded-md',
        'text-left transition-[background-color,transform] duration-[120ms] ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-primary',
        'hover:translate-x-0.5',
        isSelected ? [
          'bg-interactive-active',
          'text-text-heading',
        ] : [
          'text-text-body',
          'hover:bg-interactive-hover hover:text-text-heading',
        ],
        !isSelected && unread > 0 && 'bg-surface-elevated/60',
      )}
      style={{ width: 'calc(100% - 16px)' }}
    >
      {/* Active indicator */}
      {isSelected && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 w-1 h-4 bg-green-primary rounded-r-full" />
      )}
      {/* Mention indicator */}
      {!isSelected && mentions > 0 && (
        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#9b59b6] rounded-r-full" />
      )}
      
      {/* Channel icon */}
      <span className={cn(
        'text-lg flex-shrink-0',
        isSelected ? 'text-text-primary' : 'text-text-muted',
      )}>
        {channel.type === 'announcements' ? '📢' : channel.type === 'forum' ? '💬' : '#'}
      </span>
      
      {/* Channel name + badge */}
      <span className={cn('truncate text-sm font-medium flex-1 min-w-0', nameClass)}>
        {channel.name}
      </span>
      <ChannelBadge
        unread={unread}
        mentions={mentions}
        isSelected={isSelected}
        channelName={channel.name}
        inline
      />
    </button>
  );
}

const ChannelItem = memo(ChannelItemComponent);

interface VoiceChannelItemProps {
  channel: Channel;
  isActive: boolean;
  isJoining?: boolean;
  onJoin: () => void;
  onLeave: () => void;
  onMouseEnter?: () => void;
  serverId?: string;
  currentUserId?: string;
  canMuteMembers?: boolean;
  canDeafenMembers?: boolean;
}

function VoiceChannelItemComponent({
  channel,
  isActive,
  isJoining = false,
  onJoin,
  onLeave: _onLeave,
  onMouseEnter,
  serverId: _serverId,
  currentUserId,
  canMuteMembers = false,
  canDeafenMembers = false,
}: VoiceChannelItemProps) {
  const [openParticipantKey, setOpenParticipantKey] = useState<string | null>(null);
  const liveParticipants = useLiveVoiceParticipants(channel.id);
  const voicePresenceSelector = useMemo(
    () => selectVoiceParticipantsByChannelId(channel.id),
    [channel.id]
  );
  const voicePresence = useVoicePresenceStore(voicePresenceSelector);
  const presenceByUserId = useMemo(
    () => new Map(voicePresence.filter((p) => p.userId).map((p) => [p.userId!, p])),
    [voicePresence]
  );

  const participants = useMemo(
    () =>
      liveParticipants.map((p) => {
        const presence = p.userId ? presenceByUserId.get(p.userId) : undefined;
        return {
          sid: p.sid,
          userId: p.userId ?? null,
          name: p.name ?? 'User',
          avatarUrl: p.avatarUrl ?? null,
          isScreenSharing: p.isScreenSharing ?? false,
          isSpeaking: p.isSpeaking ?? false,
          isMuted: presence?.isMuted ?? p.isMuted,
          isDeafened: presence?.isDeafened ?? false,
        };
      }),
    [liveParticipants, presenceByUserId]
  );

  const canModerate = isActive && (canMuteMembers || canDeafenMembers);
  const handleModeration = useCallback(
    async (targetUserId: string, action: 'mute' | 'unmute' | 'deafen' | 'undeafen') => {
      const res = await fetch('/api/voice/moderation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ targetUserId, channelId: channel.id, action }),
      });
      if (res.ok) setOpenParticipantKey(null);
      else console.error('[VoiceChannelItem] moderation failed:', await res.text());
    },
    [channel.id]
  );

  return (
    <div className="mx-2" style={{ width: 'calc(100% - 16px)' }}>
      <button
        onClick={onJoin}
        onMouseEnter={onMouseEnter}
        disabled={isJoining && !isActive}
        className={cn(
          'group relative flex items-center gap-2 w-full px-2 py-1.5 rounded-md',
          'text-left transition-all duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-primary',
          
          isActive ? [
            'bg-green-primary/20',
            'text-green-primary',
          ] : [
            'text-text-secondary',
            'hover:bg-bg-hover hover:text-text-primary',
          ],
          isJoining && !isActive && 'opacity-50 cursor-not-allowed',
        )}
      >
        <span className={cn(
          'text-lg flex-shrink-0',
          isActive ? 'text-green-primary' : 'text-text-muted',
        )}>
          🔊
        </span>
        <span className="truncate text-sm font-medium flex-1">
          {channel.name}
        </span>
      </button>

      {participants.length > 0 && (
        <div className="ml-6 mt-1 space-y-1">
          {participants.map((participant) => {
            const isSelf = participant.userId === currentUserId;
            const showMenu = canModerate && !isSelf && participant.userId;
            const key = participant.sid;

            const row = (
              <div
                key={participant.sid}
                className={cn(
                  'flex items-center gap-2 px-2 py-1 text-sm rounded',
                  showMenu && 'cursor-pointer hover:bg-bg-hover text-text-secondary hover:text-text-primary'
                )}
              >
                {participant.avatarUrl ? (
                  <Image
                    src={participant.avatarUrl}
                    alt={participant.name}
                    width={20}
                    height={20}
                    sizes="20px"
                    className="w-5 h-5 rounded-full object-cover flex-shrink-0"
                    unoptimized={participant.avatarUrl.startsWith('data:') || participant.avatarUrl.startsWith('/media/')}
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-bg-quaternary flex items-center justify-center text-xs flex-shrink-0">
                    {participant.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="truncate flex items-center gap-1 flex-1 min-w-0">
                  {participant.name}
                  {participant.isMuted && (
                    <MicOff className="w-3 h-3 text-danger flex-shrink-0" aria-label="Muted" />
                  )}
                  {participant.isDeafened && (
                    <HeadphonesIcon className="w-3 h-3 text-danger flex-shrink-0" aria-label="Deafened" />
                  )}
                  {participant.isScreenSharing && (
                    <span className="text-xs text-green-primary font-medium">[ В эфире ]</span>
                  )}
                </span>
                {participant.isSpeaking && (
                  <div className="w-2 h-2 rounded-full bg-green-primary animate-pulse flex-shrink-0" />
                )}
              </div>
            );

            if (showMenu && participant.userId) {
              return (
                <Popover
                  key={key}
                  open={openParticipantKey === key}
                  onOpenChange={(open) => setOpenParticipantKey(open ? key : null)}
                  content={
                    <div className="flex flex-col gap-0.5 py-1">
                      {canMuteMembers && (
                        <button
                          type="button"
                          className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm rounded hover:bg-bg-hover text-text-primary"
                          onClick={() => handleModeration(participant.userId!, participant.isMuted ? 'unmute' : 'mute')}
                        >
                          {participant.isMuted ? (
                            <><Mic className="w-4 h-4" /> Unmute</>
                          ) : (
                            <><MicOff className="w-4 h-4" /> Mute</>
                          )}
                        </button>
                      )}
                      {canDeafenMembers && (
                        <button
                          type="button"
                          className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm rounded hover:bg-bg-hover text-text-primary"
                          onClick={() => handleModeration(participant.userId!, participant.isDeafened ? 'undeafen' : 'deafen')}
                        >
                          {participant.isDeafened ? (
                            <><HeadphonesIcon className="w-4 h-4" /> Undeafen</>
                          ) : (
                            <><Headphones className="w-4 h-4" /> Deafen</>
                          )}
                        </button>
                      )}
                    </div>
                  }
                  align="start"
                  side="right"
                >
                  <div className="w-full">{row}</div>
                </Popover>
              );
            }

            return <div key={key}>{row}</div>;
          })}
        </div>
      )}
    </div>
  );
}

const VoiceChannelItem = memo(VoiceChannelItemComponent);

export const ChannelList = memo(ChannelListComponent);
