'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMessageViewSlices } from '@/hooks/useMessageViewSlices';
import { useMessages } from '@/hooks/useMessages';
import { MessageList } from '@/components/message/MessageList';
import { MessageInput } from '@/components/message/MessageInput';
import { TypingIndicator } from '@/components/chat/TypingIndicator';
import { getRealtimeManager } from '@/lib/realtime/RealtimeManager';
import { useActivityStore } from '@/stores/activity-store';
import type { ActivityType } from '@/types/activity';
import { useMediaPreload } from '@/hooks/useMediaPreload';
import { useChannelPermissions } from '@/hooks/useChannelPermissions';
import { useServerPermissions } from '@/hooks/useServerPermissions';
import { useDMChatPermissions } from '@/hooks/useDMChatPermissions';
import { useServerMembers, useServerMeta } from '@/hooks/serverView';
import { mvEntitiesKey, mvOrderKey } from '@/lib/message-view/keys';
import type { EntitiesSlice } from '@/lib/message-view/patchers';
import type { MessageViewMessage } from '@/lib/messageView/types';
import type { NormalizeContext } from '@/lib/messages/normalizeDtoToView';
import type { DMChannel } from '@/types/dm';
import { cn } from '@/lib/utils';
import { clientEnv } from '@/lib/env/clientEnv';

const isDev = clientEnv.nodeEnv === 'development';

export interface ChatWindowProps {
  channelId: string;
  type: 'server' | 'dm';
  channelName?: string;
  currentUserId?: string;
  currentUser?: { id: string; name: string; avatarUrl: string | null };
  serverId?: string;
  dmChannel?: DMChannel;
  onAvatarClick?: (userId: string) => void;
  placeholder?: string;
  className?: string;
  /** When false, parent renders its own header (e.g. DM with call button). */
  showHeader?: boolean;
}

/**
 * Unified chat window for server channels and DM.
 * Slices store only MessageViewMessage. DTO is normalized once and not stored.
 */
export function ChatWindow({
  channelId,
  type,
  channelName = 'Channel',
  currentUserId,
  currentUser,
  serverId,
  dmChannel,
  onAvatarClick,
  placeholder,
  className,
  showHeader = true,
}: ChatWindowProps) {
  const { data: serverMembersData } = useServerMembers(type === 'server' ? serverId ?? null : null);
  const { data: serverMetaData } = useServerMeta(type === 'server' ? serverId ?? null : null);
  const serverMembers = useMemo(
    () => (type === 'server' && serverId ? (serverMembersData ?? []) : []),
    [type, serverId, serverMembersData]
  );
  const mentionMembers = useMemo(() => {
    if (type === 'server') {
      return serverMembers.map((m) => ({
        id: m.id,
        displayName: (m.nickname ?? m.name ?? '').trim() || m.id,
      }));
    }
    if (type === 'dm' && dmChannel?.otherUser) {
      return [{ id: dmChannel.otherUser.id, displayName: dmChannel.otherUser.name ?? dmChannel.otherUser.id }];
    }
    return [];
  }, [type, serverMembers, dmChannel]);
  const mentionRoles = useMemo(
    () => (type === 'server' && serverMetaData?.roles ? serverMetaData.roles.map((r) => ({ id: r.id, name: r.name })) : []),
    [type, serverMetaData?.roles]
  );

  const normalizeContext: NormalizeContext = useMemo(
    () =>
      type === 'server'
        ? { members: serverMembers, currentUser }
        : { dmChannel: dmChannel ?? undefined, currentUser },
    [type, serverMembers, dmChannel, currentUser]
  );

  const { isLoading, error, refetch, renormalizeAll, loadMoreOlder, loadingMore } = useMessageViewSlices({
    channelId,
    normalizeContext,
  });

  const clearChannel = useActivityStore((state) => state.clearChannel);
  const startActivity = useActivityStore((state) => state.startActivity);
  const stopActivity = useActivityStore((state) => state.stopActivity);

  useEffect(() => {
    if (!channelId) return;
    const topic = `channel:${channelId}`;
    const unsub = getRealtimeManager().subscribeToBroadcast(topic, 'activity', (payload: unknown) => {
      const p = payload as { event: 'activity:start' | 'activity:stop'; userId: string; userName: string; channelId: string; activityType: string };
      if (p?.event === 'activity:start') {
        startActivity(p.channelId, p.userId, p.userName ?? 'User', p.activityType as ActivityType);
      } else if (p?.event === 'activity:stop') {
        stopActivity(p.channelId, p.userId);
      }
    });
    return () => {
      unsub();
      clearChannel(channelId);
    };
  }, [channelId, startActivity, stopActivity, clearChannel]);

  const prevMembersCountRef = useRef(0);
  useEffect(() => {
    if (type !== 'server' || !serverId) return;
    const hadMembers = prevMembersCountRef.current > 0;
    const hasMembers = serverMembers.length > 0;
    prevMembersCountRef.current = serverMembers.length;
    if (!hadMembers && hasMembers && renormalizeAll) renormalizeAll(normalizeContext);
  }, [type, serverId, serverMembers.length, normalizeContext, renormalizeAll]);
  const {
    sendMessage,
    isConnected,
    hasMore,
    optimisticUpdateMessage,
    optimisticAddReaction,
    optimisticRemoveReaction,
    optimisticDeleteMessage,
  } = useMessages({ channelId, currentUserId, currentUser, normalizeContext });

  const entitiesQuery = useQuery({
    queryKey: mvEntitiesKey(channelId),
    queryFn: () => ({}),
    enabled: false,
  });
  const orderQuery = useQuery({
    queryKey: mvOrderKey(channelId),
    queryFn: () => [],
    enabled: false,
  });
  const entities = useMemo(
    () => (entitiesQuery.data ?? {}) as EntitiesSlice,
    [entitiesQuery.data]
  );
  const order = useMemo(
    () => (orderQuery.data ?? []) as string[],
    [orderQuery.data]
  );
  const messages = useMemo(
    () =>
      order
        .map((id) => {
          const entry = entities[id];
          return entry && typeof entry === 'object' && 'view' in entry ? entry.view : entry != null ? (entry as unknown as MessageViewMessage) : undefined;
        })
        .filter((m): m is MessageViewMessage => m != null) as MessageViewMessage[],
    [order, entities]
  );

  const channelPermsResult = useChannelPermissions(channelId, serverId ?? null, currentUserId ?? null);
  const dmPermsResult = useDMChatPermissions(channelId);
  const channelPerms = type === 'server' ? channelPermsResult.permissions : dmPermsResult.permissions;
  const isLoadingPerms = type === 'server' ? channelPermsResult.isLoading : dmPermsResult.isLoading;
  const { permissions: serverPerms } = useServerPermissions(serverId ?? null);

  const mediaUrls = useMemo(
    () =>
      messages.flatMap((m) =>
        (m.mediaFiles ?? []).map((f) => f.url).filter(Boolean) as string[]
      ),
    [messages]
  );
  useMediaPreload(mediaUrls, !!channelId);

  const [replyTo, setReplyTo] = useState<MessageViewMessage | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);

  useEffect(() => {
    if (isDev) {
      console.log('[ChatWindow]', {
        channelId,
        channelName,
        type,
        messagesCount: messages.length,
        isLoading,
        hasError: !!error,
        isConnected,
      });
    }
  }, [channelId, channelName, type, messages.length, isLoading, error, isConnected]);

  useEffect(() => {
    setReplyTo(null);
    setEditingMessageId(null);
  }, [channelId]);

  const handleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!channelId || !currentUserId) return;
      const message = messages.find((m) => m.id === messageId);
      if (!message) return;
      const existingReaction = message.reactions?.find((r) => r.emoji === emoji && r.reactedByMe);
      if (existingReaction) {
        optimisticRemoveReaction(channelId, messageId, emoji);
      } else {
        optimisticAddReaction(channelId, messageId, emoji);
      }
      try {
        const response = await fetch(`/api/messages/${messageId}/reactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ emoji }),
        });
        if (!response.ok) throw new Error('Failed to add reaction');
      } catch (err) {
        console.error('Failed to add reaction:', err);
        if (existingReaction) {
          optimisticAddReaction(channelId, messageId, emoji);
        } else {
          optimisticRemoveReaction(channelId, messageId, emoji);
        }
      }
    },
    [
      channelId,
      currentUserId,
      messages,
      optimisticAddReaction,
      optimisticRemoveReaction,
    ]
  );

  const handleReply = useCallback(
    (messageId: string) => {
      const message = messages.find((m) => m.id === messageId);
      if (message) setReplyTo(message);
    },
    [messages]
  );

  const handleEdit = useCallback((messageId: string) => {
    setEditingMessageId(messageId);
  }, []);

  const handleSaveEdit = useCallback(
    async (content: string) => {
      if (!editingMessageId || !channelId) return;
      const message = messages.find((m) => m.id === editingMessageId);
      if (!message) return;
      const previousContent = message.content;
      const previousEditedAt = message.editedAt;
      optimisticUpdateMessage(channelId, editingMessageId, {
        content,
        editedAt: new Date(),
      });
      setEditingMessageId(null);
      try {
        const response = await fetch(`/api/messages/${editingMessageId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ content }),
        });
        if (!response.ok) throw new Error('Failed to edit message');
      } catch (err) {
        console.error('Failed to edit message:', err);
        optimisticUpdateMessage(channelId, editingMessageId, {
          content: previousContent,
          editedAt: previousEditedAt,
        });
        setEditingMessageId(editingMessageId);
      }
    },
    [channelId, editingMessageId, messages, optimisticUpdateMessage]
  );

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
  }, []);

  const handleDeleteMessage = useCallback(
    async (messageId: string) => {
      if (!channelId) return;
      optimisticDeleteMessage(channelId, messageId);
      try {
        const response = await fetch(`/api/messages/${messageId}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (!response.ok) throw new Error('Failed to delete message');
      } catch (err) {
        console.error('Failed to delete message:', err);
        await refetch?.();
        alert('Failed to delete message');
      }
    },
    [channelId, optimisticDeleteMessage, refetch]
  );

  if (!channelId) {
    return (
      <div className={cn('flex-1 flex items-center justify-center bg-bg-secondary', className)}>
        <p className="text-text-muted">Select a channel to view messages</p>
      </div>
    );
  }

  const canViewChannel = type === 'server' ? channelPerms.canViewChannel : true;
  if (!isLoadingPerms && type === 'server' && !canViewChannel) {
    return (
      <div className={cn('flex-1 flex flex-col min-w-0 bg-bg-secondary', className)}>
        {showHeader && <ChatHeader channelName={channelName} isConnected={false} />}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-lg font-semibold text-text-primary mb-2">Channel Hidden</p>
            <p className="text-sm text-text-muted">You don&apos;t have permission to view this channel</p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading && messages.length === 0) {
    return (
      <div className={cn('flex-1 flex flex-col bg-bg-secondary', className)}>
        {showHeader && <ChatHeader channelName={channelName} isConnected={isConnected} />}
        <div className="flex-1 flex items-center justify-center">
          <p className="text-text-muted">Loading messages...</p>
        </div>
        <MessageInput
          channelId={channelId}
          onSendMessage={() => {}}
          disabled
          placeholder={placeholder ?? `Message #${channelName}`}
          serverId={serverId}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('flex-1 flex flex-col bg-bg-secondary', className)}>
        {showHeader && <ChatHeader channelName={channelName} isConnected={false} />}
        <div className="flex-1 flex flex-col items-center justify-center gap-2 p-4">
          <p className="text-danger font-medium">Failed to load messages</p>
          <p className="text-text-muted text-sm text-center">{error.message}</p>
          <button
            type="button"
            onClick={() => refetch?.()}
            className="mt-2 px-4 py-2 rounded-lg bg-green-primary text-bg-primary hover:bg-green-hover transition-colors"
          >
            Retry
          </button>
        </div>
        <MessageInput
          channelId={channelId}
          onSendMessage={sendMessage}
          disabled
          placeholder={placeholder ?? `Message #${channelName}`}
          serverId={serverId}
        />
      </div>
    );
  }

  return (
    <div className={cn('flex-1 flex flex-col min-w-0 bg-bg-secondary', className)}>
      {showHeader && <ChatHeader channelName={channelName} isConnected={isConnected} />}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col messages-container">
        <MessageList
          messages={messages}
          channelId={channelId}
          currentUserId={currentUserId}
          serverId={serverId}
          members={type === 'server' ? serverMembers : undefined}
          onReaction={handleReaction}
          onReply={handleReply}
          onEdit={handleEdit}
          onAvatarClick={onAvatarClick}
          editingMessageId={editingMessageId}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={handleCancelEdit}
          canAddReactions={channelPerms.canAddReactions}
          canManageRoles={serverPerms.canManageRoles}
          canKick={serverPerms.canKickMembers}
          canBan={serverPerms.canBanMembers}
          canManageMessages={channelPerms.canManageMessages}
          onDeleteMessage={handleDeleteMessage}
          hasMore={hasMore}
          onLoadMore={loadMoreOlder}
          loadingMore={loadingMore}
        />
        <TypingIndicator channelId={channelId} currentUserId={currentUserId ?? ''} />
      </div>
      <MessageInput
        channelId={channelId}
        onSendMessage={(content, replyToId, media) => {
          sendMessage(content, replyToId ?? null, media);
          setReplyTo(null);
        }}
        disabled={!channelId || !channelPerms.canSendMessages || isLoadingPerms}
        placeholder={
          !channelPerms.canSendMessages
            ? 'You cannot send messages in this channel'
            : placeholder ?? `Message #${channelName}`
        }
        serverId={serverId}
        replyTo={
          replyTo
            ? {
                id: replyTo.id,
                content: replyTo.content,
                user: { id: replyTo.author.id, name: replyTo.author.username },
              }
            : null
        }
        onCancelReply={() => setReplyTo(null)}
        canAttachFiles={channelPerms.canAttachFiles}
        canMentionEveryone={channelPerms.canMentionEveryone}
        mentionMembers={mentionMembers}
        mentionRoles={mentionRoles}
      />
    </div>
  );
}

function ChatHeader({
  channelName,
  isConnected,
}: {
  channelName: string;
  isConnected: boolean;
}) {
  return (
    <div
      className={cn(
        'h-12 px-4 flex items-center gap-3 flex-shrink-0',
        'bg-gradient-to-b from-bg-tertiary to-bg-secondary',
        'border-b border-border-primary shadow-sm',
      )}
    >
      <span className="text-xl text-text-muted">#</span>
      <h3 className="font-semibold text-text-primary truncate">{channelName}</h3>
      <div className="h-6 w-px bg-border-primary mx-2 flex-shrink-0" />
      <span className="text-sm text-text-muted truncate">
        {isConnected ? 'Live' : 'Connecting…'}
      </span>
    </div>
  );
}
