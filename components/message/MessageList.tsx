'use client';

import { useRef, useEffect, useCallback, memo, useState, useMemo, useLayoutEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { MessageViewMessage } from '@/lib/messageView/types';
import type { ServerViewMember } from '@/hooks/useServerViewQuery';
import { MessageItem } from './MessageItem';
import { clientEnv } from '@/lib/env/clientEnv';

const isDev = clientEnv.nodeEnv === 'development';
const ESTIMATE_SIZE = 88;
const OVERSCAN = 8;

export interface MessageListProps {
  messages: MessageViewMessage[];
  channelId?: string;
  height?: number;
  currentUserId?: string;
  serverId?: string;
  onReaction?: (messageId: string, emoji: string) => void;
  onReply?: (messageId: string) => void;
  onEdit?: (messageId: string) => void;
  onSaveEdit?: (content: string) => void;
  onCancelEdit?: () => void;
  editingMessageId?: string | null;
  onAvatarClick?: (userId: string) => void;
  canAddReactions?: boolean;
  canManageRoles?: boolean;
  canKick?: boolean;
  canBan?: boolean;
  canManageMessages?: boolean;
  onDeleteMessage?: (messageId: string) => void;
  members?: ServerViewMember[];
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
}

interface VirtualMessageRowProps {
  message: MessageViewMessage;
  isNewMessage?: boolean;
  currentUserId?: string;
  serverId?: string;
  editingMessageId?: string | null;
  onReaction?: (messageId: string, emoji: string) => void;
  onReply?: (messageId: string) => void;
  onEdit?: (messageId: string) => void;
  onSaveEdit?: (content: string) => void;
  onCancelEdit?: () => void;
  onAvatarClick?: (userId: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  canAddReactions?: boolean;
  canManageRoles?: boolean;
  canKick?: boolean;
  canBan?: boolean;
  canManageMessages?: boolean;
}

const VirtualMessageRow = memo(function VirtualMessageRow({
  message,
  isNewMessage = false,
  currentUserId,
  serverId,
  editingMessageId,
  onReaction,
  onReply,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onAvatarClick,
  onDeleteMessage,
  canAddReactions = true,
  canManageRoles = false,
  canKick = false,
  canBan = false,
  canManageMessages = false,
}: VirtualMessageRowProps) {
  const handleReaction = useCallback(
    (emoji: string) => {
      onReaction?.(message.id, emoji);
    },
    [message.id, onReaction]
  );
  const handleReply = useCallback(() => onReply?.(message.id), [message.id, onReply]);
  const handleEdit = useCallback(() => onEdit?.(message.id), [message.id, onEdit]);
  const handleDelete = useCallback(
    () => onDeleteMessage?.(message.id),
    [message.id, onDeleteMessage]
  );

  return (
    <MessageItem
      message={message}
      isNewMessage={isNewMessage}
      isOwnMessage={!!currentUserId && currentUserId === message.author.id}
      isEditing={editingMessageId === message.id}
      onReaction={onReaction ? handleReaction : undefined}
      onReply={onReply ? handleReply : undefined}
      onEdit={onEdit ? handleEdit : undefined}
      onSaveEdit={onSaveEdit}
      onCancelEdit={onCancelEdit}
      onAvatarClick={onAvatarClick}
      currentUserId={currentUserId}
      serverId={serverId}
      canAddReactions={canAddReactions}
      canManageRoles={canManageRoles}
      canKick={canKick}
      canBan={canBan}
      canManageMessages={canManageMessages}
      onDeleteMessage={onDeleteMessage ? handleDelete : undefined}
    />
  );
});

export function MessageList({
  messages,
  channelId,
  height,
  currentUserId,
  serverId,
  onReaction,
  onReply,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  editingMessageId,
  onAvatarClick,
  canAddReactions = true,
  canManageRoles = false,
  canKick = false,
  canBan = false,
  canManageMessages = false,
  onDeleteMessage,
  hasMore = false,
  onLoadMore,
  loadingMore = false,
}: MessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const safeMessages = useMemo(() => (Array.isArray(messages) ? messages : []), [messages]);
  const count = safeMessages.length;
  const prevCountRef = useRef(0);
  const prevFirstIdRef = useRef<string | null>(null);
  const prevLastIdRef = useRef<string | null>(null);
  const prevScrollHeightRef = useRef(0);
  const wasNearBottomRef = useRef(true);
  const loadMoreInFlightRef = useRef(false);
  const restoredScrollRef = useRef(false);
  const restoreAttemptedRef = useRef(false);
  const [lastNewMessageId, setLastNewMessageId] = useState<string | null>(null);
  const scrollSessionKey = useMemo(
    () => (channelId ? `message-list:scroll:${channelId}` : null),
    [channelId]
  );

  const rowVirtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATE_SIZE,
    overscan: OVERSCAN,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  const firstId = count > 0 ? safeMessages[0]?.id : undefined;
  const lastMessageId = count > 0 ? safeMessages[count - 1]?.id ?? null : null;
  useEffect(() => {
    if (isDev && count > 0 && firstId !== undefined) {
      console.log('[MessageList]', { count, firstId });
    }
  }, [count, firstId]);

  const isNearBottom = useCallback(() => {
    const el = parentRef.current;
    if (!el) return true;
    const threshold = 120;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distance <= threshold;
  }, []);

  const updateNearBottom = useCallback(() => {
    wasNearBottomRef.current = isNearBottom();
  }, [isNearBottom]);

  const tryLoadOlder = useCallback(() => {
    if (!hasMore || !onLoadMore || loadingMore || loadMoreInFlightRef.current) return;
    loadMoreInFlightRef.current = true;
    onLoadMore();
  }, [hasMore, onLoadMore, loadingMore]);

  useEffect(() => {
    if (!loadingMore) {
      loadMoreInFlightRef.current = false;
    }
  }, [loadingMore]);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const onScroll = () => {
      updateNearBottom();
      if (scrollSessionKey) {
        window.sessionStorage.setItem(scrollSessionKey, String(el.scrollTop));
      }
    };
    updateNearBottom();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [scrollSessionKey, updateNearBottom]);

  useEffect(() => {
    const root = parentRef.current;
    const target = topSentinelRef.current;
    if (!root || !target || !hasMore || !onLoadMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          tryLoadOlder();
        }
      },
      {
        root,
        rootMargin: '120px 0px 0px 0px',
        threshold: 0,
      }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [count, hasMore, onLoadMore, tryLoadOlder]);

  useEffect(() => {
    restoreAttemptedRef.current = false;
    restoredScrollRef.current = false;
  }, [scrollSessionKey]);

  useLayoutEffect(() => {
    const el = parentRef.current;
    if (!el || count === 0 || restoreAttemptedRef.current) return;
    restoreAttemptedRef.current = true;
    if (!scrollSessionKey) return;
    const raw = window.sessionStorage.getItem(scrollSessionKey);
    if (raw == null) return;
    const scrollTop = Number(raw);
    if (!Number.isFinite(scrollTop)) return;
    el.scrollTop = scrollTop;
    restoredScrollRef.current = true;
    updateNearBottom();
  }, [count, scrollSessionKey, updateNearBottom]);

  useLayoutEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const prevCount = prevCountRef.current;
    const prevFirstId = prevFirstIdRef.current;
    const prevLastId = prevLastIdRef.current;
    const currentFirstId = firstId ?? null;
    const currentLastId = lastMessageId ?? null;
    const nearBottomBeforeUpdate = isNearBottom();

    const isInitialLoad = prevCount === 0 && count > 0;
    const isPrepend = count > prevCount && prevFirstId !== null && prevFirstId !== currentFirstId && prevLastId === currentLastId;
    const isAppend = count > prevCount && prevLastId !== null && prevLastId !== currentLastId;
    const isInPlaceUpdate =
      count === prevCount &&
      prevFirstId === currentFirstId &&
      prevLastId === currentLastId;

    if (isInitialLoad) {
      if (restoredScrollRef.current) {
        restoredScrollRef.current = false;
      } else {
        rowVirtualizer.scrollToIndex(count - 1, { align: 'end', behavior: 'auto' });
      }
    } else if (isPrepend) {
      const delta = el.scrollHeight - prevScrollHeightRef.current;
      if (delta > 0) {
        el.scrollTop += delta;
      }
    } else if (isAppend && nearBottomBeforeUpdate) {
      if (lastMessageId) setLastNewMessageId(lastMessageId);
      rowVirtualizer.scrollToIndex(count - 1, { align: 'end', behavior: 'auto' });
    } else if (isInPlaceUpdate) {
      // In-place edits/reactions should not affect scroll anchoring.
    }

    prevCountRef.current = count;
    prevFirstIdRef.current = currentFirstId;
    prevLastIdRef.current = currentLastId;
    prevScrollHeightRef.current = el.scrollHeight;
    updateNearBottom();
  }, [count, firstId, lastMessageId, rowVirtualizer, updateNearBottom, isNearBottom]);

  useEffect(() => {
    if (!lastNewMessageId) return;
    const t = setTimeout(() => setLastNewMessageId(null), 150);
    return () => clearTimeout(t);
  }, [lastNewMessageId]);

  if (count === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-secondary">
        <div className="text-center">
          <div className="text-4xl mb-4">💬</div>
          <p className="text-text-secondary text-lg">No messages yet</p>
          <p className="text-text-muted text-sm mt-1">Start the conversation!</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-1 min-h-0 flex flex-col bg-bg-secondary message-list"
      style={height ? { height } : undefined}
    >
      {hasMore && onLoadMore && (
        <div className="flex justify-center py-3 border-b border-border-primary/50 bg-bg-secondary flex-shrink-0">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-bg-tertiary hover:bg-bg-hover text-text-secondary disabled:opacity-50 transition-colors"
          >
            {loadingMore ? 'Загрузка…' : 'Загрузить ещё'}
          </button>
        </div>
      )}
      <div ref={parentRef} className="flex-1 min-h-0 overflow-auto">
        <div ref={topSentinelRef} className="h-px w-full" aria-hidden="true" />
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualItems.map((virtualRow) => {
            const message = safeMessages[virtualRow.index];
            if (!message) {
              if (isDev) console.warn(`[MessageList] Message at index ${virtualRow.index} is null/undefined`);
              return null;
            }
            return (
              <div
                key={message.id}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <VirtualMessageRow
                  message={message}
                  isNewMessage={message.id === lastNewMessageId}
                  currentUserId={currentUserId}
                  serverId={serverId}
                  editingMessageId={editingMessageId}
                  onReaction={onReaction}
                  onReply={onReply}
                  onEdit={onEdit}
                  onSaveEdit={onSaveEdit}
                  onCancelEdit={onCancelEdit}
                  onAvatarClick={onAvatarClick}
                  onDeleteMessage={onDeleteMessage}
                  canAddReactions={canAddReactions}
                  canManageRoles={canManageRoles}
                  canKick={canKick}
                  canBan={canBan}
                  canManageMessages={canManageMessages}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
