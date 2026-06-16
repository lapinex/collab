'use client';

import { memo, useCallback, useMemo } from 'react';
import { Avatar } from '@/components/profile/Avatar';
import { cn } from '@/lib/utils';
import { DMBadge } from '@/components/notifications/DMBadge';
import { useBadgeStore } from '@/stores/badge-store';
import { selectDMBadge } from '@/stores/badge.selectors';
import type { DMChannel } from '@/types/dm';

interface DMListProps {
  channels: DMChannel[];
  selectedChannelId?: string;
  onSelectChannel: (channelId: string) => void;
  onUserClick?: (userId: string) => void;
  isLoading?: boolean;
}

interface DMRowProps {
  channel: DMChannel;
  isSelected: boolean;
  onSelectChannel: (channelId: string) => void;
  onUserClick?: (userId: string) => void;
}

const DMRow = memo(function DMRow({ channel, isSelected, onSelectChannel, onUserClick }: DMRowProps) {
  const badgeSelector = useMemo(() => selectDMBadge(channel.id), [channel.id]);
  const badge = useBadgeStore(badgeSelector);
  const unread = badge?.unread ?? 0;
  const preview =
    channel.lastMessage
      ? channel.lastMessage.content.substring(0, 50) + (channel.lastMessage.content.length > 50 ? '...' : '')
      : 'No messages yet';

  const handleClick = useCallback(() => {
    onSelectChannel(channel.id);
  }, [channel.id, onSelectChannel]);

  const handleUserClick = useCallback(
    (e: React.MouseEvent) => {
      if (onUserClick) {
        e.stopPropagation();
        onUserClick(channel.otherUser.id);
      }
    },
    [channel.otherUser.id, onUserClick]
  );

  return (
    <button
      onClick={handleClick}
      className={cn(
        'w-full px-3 py-2 flex items-center gap-3',
        'text-left transition-[background-color,transform] duration-[120ms] ease-out',
        'hover:bg-interactive-hover hover:translate-x-0.5',
        isSelected && 'bg-interactive-active',
        !isSelected && unread > 0 && 'bg-surface-elevated/60'
      )}
    >
      <div
        data-user-profile-trigger
        data-user-id={channel.otherUser.id}
        onClick={handleUserClick}
        className={cn('relative flex-shrink-0', onUserClick && 'cursor-pointer')}
      >
        <Avatar
          src={channel.otherUser.avatarUrl}
          name={channel.otherUser.name}
          size="md"
          status="online"
          showStatus
        />
        <DMBadge unread={unread} />
      </div>
      <div className="flex-1 min-w-0 min-h-0">
        <div
          data-user-profile-trigger
          data-user-id={channel.otherUser.id}
          onClick={handleUserClick}
          className={cn(
            'text-sm font-medium text-text-heading truncate',
            onUserClick && 'cursor-pointer hover:underline'
          )}
        >
          {channel.otherUser.name}
        </div>
        <div className="text-xs text-text-muted truncate">{preview}</div>
      </div>
    </button>
  );
});

function DMListComponent({
  channels,
  selectedChannelId,
  onSelectChannel,
  onUserClick,
  isLoading,
}: DMListProps) {
  if (isLoading) {
    return (
      <div className="p-4 space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-surface-skeleton rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (channels.length === 0) {
    return (
      <div className="p-4 text-center text-text-muted text-sm">
        No direct messages yet
      </div>
    );
  }

  return (
    <div className="py-2">
      {channels.map((channel) => (
        <DMRow
          key={channel.id}
          channel={channel}
          isSelected={selectedChannelId === channel.id}
          onSelectChannel={onSelectChannel}
          onUserClick={onUserClick}
        />
      ))}
    </div>
  );
}

export const DMList = memo(DMListComponent);
