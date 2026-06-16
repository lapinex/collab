'use client';

import { useMemo, useState } from 'react';
import { Avatar } from '@/components/profile/Avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePresenceStore } from '@/stores/presence-store';
import { selectPresenceStatusByUserId } from '@/stores/presence.selectors';
import type { PresenceStatus } from '@/components/profile/Avatar';

export type RelationshipStatus =
  | 'friend'
  | 'pending_incoming'
  | 'pending_outgoing'
  | 'blocked'
  | 'blocked_by'
  | 'none'
  | 'self';

export interface UserCardUser {
  id: string;
  username: string;
  avatar: string | null;
  status?: PresenceStatus;
}

interface UserCardProps {
  user: UserCardUser;
  relationship: RelationshipStatus;
  requestId?: string | null;
  currentUserId: string;
  onClick?: (userId: string) => void;
  onAddFriend?: (userId: string) => Promise<void>;
  onAccept?: (requestId: string) => Promise<void>;
  onDecline?: (requestId: string) => Promise<void>;
  onCancel?: (requestId: string) => Promise<void>;
  onRemoveFriend?: (userId: string) => Promise<void>;
  onBlock?: (userId: string) => Promise<void>;
  onUnblock?: (userId: string) => Promise<void>;
  onMessage?: (userId: string) => Promise<void>;
  canMessage?: boolean;
}

export function UserCard({
  user,
  relationship,
  requestId,
  currentUserId,
  onClick,
  onAddFriend,
  onAccept,
  onDecline,
  onCancel,
  onRemoveFriend,
  onBlock,
  onUnblock,
  onMessage,
  canMessage = false,
}: UserCardProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const statusSelector = useMemo(() => selectPresenceStatusByUserId(user.id), [user.id]);
  const statusFromStore = usePresenceStore(statusSelector);
  const status = (user.status ?? statusFromStore) as PresenceStatus;

  const handle = async (
    action: string,
    fn: (() => Promise<void>) | undefined
  ) => {
    if (!fn) return;
    setLoading(action);
    try {
      await fn();
    } finally {
      setLoading(null);
    }
  };

  const isOwn = user.id === currentUserId;

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick ? () => onClick(user.id) : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(user.id); } } : undefined}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg',
        'hover:bg-bg-hover transition-colors',
        onClick && 'cursor-pointer'
      )}
    >
      <Avatar
        src={user.avatar}
        name={user.username}
        size="md"
        status={status}
        showStatus
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text-primary truncate">
          {user.username}
        </div>
        <div className="text-xs text-text-muted">
          {status === 'online' && 'Online'}
          {status === 'idle' && 'Idle'}
          {status === 'dnd' && 'Do Not Disturb'}
          {status === 'offline' && 'Offline'}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {!isOwn && relationship !== 'self' && relationship !== 'blocked_by' && (
          <>
            {relationship === 'none' && onAddFriend && (
              <Button
                size="sm"
                variant="outline"
                disabled={!!loading}
                onClick={() => handle('add', () => onAddFriend(user.id))}
              >
                {loading === 'add' ? '...' : 'Add Friend'}
              </Button>
            )}
            {relationship === 'pending_incoming' && onAccept && requestId && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!loading}
                  onClick={() => handle('accept', () => onAccept(requestId))}
                >
                  {loading === 'accept' ? '...' : 'Accept'}
                </Button>
                {onDecline && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!!loading}
                    onClick={() => handle('decline', () => onDecline!(requestId))}
                  >
                    Decline
                  </Button>
                )}
              </>
            )}
            {relationship === 'pending_outgoing' && onCancel && requestId && (
              <Button
                size="sm"
                variant="ghost"
                disabled={!!loading}
                onClick={() => handle('cancel', () => onCancel(requestId))}
              >
                {loading === 'cancel' ? '...' : 'Cancel'}
              </Button>
            )}
            {relationship === 'friend' && (
              <>
                {canMessage && onMessage && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!loading}
                    onClick={() => handle('message', () => onMessage(user.id))}
                  >
                    Message
                  </Button>
                )}
                {onRemoveFriend && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!!loading}
                    onClick={() => handle('remove', () => onRemoveFriend(user.id))}
                  >
                    {loading === 'remove' ? '...' : 'Remove'}
                  </Button>
                )}
              </>
            )}
            {relationship === 'blocked' && onUnblock && (
              <Button
                size="sm"
                variant="ghost"
                disabled={!!loading}
                onClick={() => handle('unblock', () => onUnblock(user.id))}
              >
                {loading === 'unblock' ? '...' : 'Unblock'}
              </Button>
            )}
            {onBlock && relationship !== 'blocked' && (
              <Button
                size="sm"
                variant="ghost"
                className="text-danger hover:text-danger hover:bg-danger/10"
                disabled={!!loading}
                onClick={() => handle('block', () => onBlock(user.id))}
              >
                Block
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
