'use client';

import { useCallback, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MessageDTO } from '@/lib/messages/dto';
import type { MessageViewMessage } from '@/lib/messageView/types';
import { useBroadcastChannel } from './useBroadcastChannel';
import { fetchMessages } from './useMessagesQuery';
import { hydrateMessageViewSlices } from './useMessageViewSlices';
import { normalizeDtoToView, getAuthorForUserInContext, type NormalizeContext } from '@/lib/messages/normalizeDtoToView';
import {
  mvEntitiesKey,
  mvOrderKey,
  mvMetaKey,
  type MessageViewMeta,
} from '@/lib/message-view/keys';
import type { EntitiesSlice, EntityEntry } from '@/lib/message-view/patchers';
import {
  getViewsMap,
  patchMessageCreated,
  patchMessageUpdated,
  patchMessageDeleted,
  patchReactionAdded,
  patchReactionRemoved,
} from '@/lib/message-view/patchers';
import {
  removeCachedMessage,
  upsertMessagesCache,
} from '@/lib/local-cache/messagesRepo';
import { syncChannelMessagesCacheFirst } from '@/lib/local-cache/sync';

interface UseMessagesOptions {
  channelId: string;
  currentUserId?: string;
  currentUser?: { id: string; name: string; avatarUrl: string | null };
  /** Required to normalize realtime payload to MessageViewMessage. Same as useMessageViewSlices. */
  normalizeContext: NormalizeContext;
}

function getSlices(
  queryClient: ReturnType<typeof useQueryClient>,
  channelId: string
) {
  const entities =
    (queryClient.getQueryData(mvEntitiesKey(channelId)) as EntitiesSlice) ??
    {};
  const order = (queryClient.getQueryData(mvOrderKey(channelId)) as string[]) ?? [];
  const meta =
    (queryClient.getQueryData(mvMetaKey(channelId)) as MessageViewMeta) ?? {
      hasMore: false,
      oldestLoadedId: null,
      newestLoadedId: null,
      oldestCursor: null,
    };
  return { entities, order, meta };
}

function applyPatch(
  queryClient: ReturnType<typeof useQueryClient>,
  channelId: string,
  result: Partial<{
    entities: EntitiesSlice;
    order: string[];
    meta: MessageViewMeta;
  }>
) {
  if (result.entities != null)
    queryClient.setQueryData(mvEntitiesKey(channelId), result.entities);
  if (result.order != null)
    queryClient.setQueryData(mvOrderKey(channelId), result.order);
  if (result.meta != null)
    queryClient.setQueryData(mvMetaKey(channelId), result.meta);
}

function isMessageDTO(raw: unknown): raw is MessageDTO {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  return typeof o.id === 'string' && typeof o.content === 'string' && o.user != null && typeof o.user === 'object';
}

/** Build minimal DTO from view for storing in slice (enables re-normalize later). */
function viewToStubDto(view: MessageViewMessage): MessageDTO {
  return {
    id: view.id,
    content: view.content,
    createdAt: view.createdAt instanceof Date ? view.createdAt.toISOString() : String(view.createdAt),
    editedAt: view.editedAt instanceof Date ? view.editedAt.toISOString() : view.editedAt ?? null,
    user: {
      id: view.author.id,
      name: view.author.username,
      avatarUrl: view.author.avatar ?? null,
    },
    replyToId: null,
    reactions: view.reactions ?? [],
    mediaFiles: view.mediaFiles,
    clientGeneratedId: view.clientGeneratedId,
  };
}

export function useMessages({ channelId, currentUserId, currentUser, normalizeContext }: UseMessagesOptions) {
  const queryClient = useQueryClient();
  const channelIdRef = useRef(channelId);
  channelIdRef.current = channelId;
  const normalizeContextRef = useRef(normalizeContext);
  normalizeContextRef.current = normalizeContext;

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
  const metaQuery = useQuery({
    queryKey: mvMetaKey(channelId),
    queryFn: () => ({
      hasMore: false,
      oldestLoadedId: null,
      newestLoadedId: null,
      oldestCursor: null,
    }),
    enabled: false,
  });

  const entities = (entitiesQuery.data ?? {}) as EntitiesSlice;
  const order = (orderQuery.data ?? []) as string[];
  const meta = (metaQuery.data ?? {
    hasMore: false,
    oldestLoadedId: null,
    newestLoadedId: null,
    oldestCursor: null,
  }) as MessageViewMeta;

  const messages = useMemo(
    () =>
      order
        .map((id) => {
          const entry = entities[id];
          return entry && 'view' in entry ? entry.view : (entry as unknown as MessageViewMessage);
        })
        .filter(Boolean) as MessageViewMessage[],
    [order, entities]
  );
  const hasMore = meta.hasMore;
  const count = messages.length;

  const onRealtimeMessage = useCallback(
    (payload: unknown) => {
      const cid = channelIdRef.current;
      if (!cid) return;
      if (!isMessageDTO(payload)) return;
      const { entities: e, order: o, meta: m } = getSlices(queryClient, cid);
      const ctx = { ...normalizeContextRef.current, entities: getViewsMap(e) };
      const view = normalizeDtoToView(payload, ctx);
      const entry: EntityEntry = { dto: payload, view };
      const result = patchMessageCreated(e, o, m, entry);
      applyPatch(queryClient, cid, result);
      if (currentUserId) {
        void upsertMessagesCache(currentUserId, cid, [payload]);
      }
    },
    [queryClient, currentUserId]
  );

  const onRealtimeMessageUpdated = useCallback(
    (payload: unknown) => {
      const cid = channelIdRef.current;
      if (!cid) return;
      const raw = payload && typeof payload === 'object' ? (payload as Partial<MessageDTO> & { id?: string }) : null;
      if (!raw || typeof raw.id !== 'string') return;
      const { entities: e, order: o, meta: m } = getSlices(queryClient, cid);
      const ctx = { ...normalizeContextRef.current, entities: getViewsMap(e) };
      const view = normalizeDtoToView(raw as MessageDTO, ctx);
      const result = patchMessageUpdated(e, o, m, raw.id, {
        content: view.content,
        editedAt: view.editedAt,
        author: view.author,
        replyTo: view.replyTo,
        reactions: view.reactions,
        mediaFiles: view.mediaFiles,
        embeds: view.embeds,
      });
      applyPatch(queryClient, cid, result);
      if (currentUserId && isMessageDTO(raw)) {
        void upsertMessagesCache(currentUserId, cid, [raw]);
      }
    },
    [queryClient, currentUserId]
  );

  const onRealtimeMessageDeleted = useCallback(
    (payload: unknown) => {
      const cid = channelIdRef.current;
      if (!cid) return;
      const raw = payload && typeof payload === 'object' ? payload : null;
      if (!raw || typeof raw !== 'object') return;
      const id = (raw as Record<string, unknown>).id as string | undefined;
      if (!id) return;
      const { entities: e, order: o, meta: m } = getSlices(queryClient, cid);
      const result = patchMessageDeleted(e, o, m, id);
      applyPatch(queryClient, cid, result);
      if (currentUserId) {
        void removeCachedMessage(currentUserId, id);
      }
    },
    [queryClient, currentUserId]
  );

  const onRealtimeReactionAdded = useCallback(
    (payload: unknown) => {
      const cid = channelIdRef.current;
      if (!cid) return;
      const raw = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
      if (!raw || typeof raw.messageId !== 'string' || typeof raw.emoji !== 'string' || typeof raw.userId !== 'string')
        return;
      const { entities: e, order: o, meta: m } = getSlices(queryClient, cid);
      const result = patchReactionAdded(e, o, m, raw.messageId as string, { emoji: raw.emoji as string, userId: raw.userId as string }, currentUserId);
      applyPatch(queryClient, cid, result);
    },
    [queryClient, currentUserId]
  );

  const onRealtimeReactionRemoved = useCallback(
    (payload: unknown) => {
      const cid = channelIdRef.current;
      if (!cid) return;
      const raw = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
      if (!raw || typeof raw.messageId !== 'string' || typeof raw.emoji !== 'string' || typeof raw.userId !== 'string')
        return;
      const { entities: e, order: o, meta: m } = getSlices(queryClient, cid);
      const result = patchReactionRemoved(e, o, m, raw.messageId as string, raw.emoji as string, raw.userId as string, currentUserId);
      applyPatch(queryClient, cid, result);
    },
    [queryClient, currentUserId]
  );

  const { isConnected } = useBroadcastChannel({
    channelName: channelId ? `channel:${channelId}` : '',
    event: 'message',
    enabled: !!channelId,
    onMessage: onRealtimeMessage,
  });
  useBroadcastChannel({
    channelName: channelId ? `channel:${channelId}` : '',
    event: 'message:updated',
    enabled: !!channelId,
    onMessage: onRealtimeMessageUpdated,
  });
  useBroadcastChannel({
    channelName: channelId ? `channel:${channelId}` : '',
    event: 'message:deleted',
    enabled: !!channelId,
    onMessage: onRealtimeMessageDeleted,
  });
  useBroadcastChannel({
    channelName: channelId ? `channel:${channelId}` : '',
    event: 'message_reaction_added',
    enabled: !!channelId,
    onMessage: onRealtimeReactionAdded,
  });
  useBroadcastChannel({
    channelName: channelId ? `channel:${channelId}` : '',
    event: 'message_reaction_removed',
    enabled: !!channelId,
    onMessage: onRealtimeReactionRemoved,
  });

  const optimisticUpdateMessage = useCallback(
    (cid: string, messageId: string, updates: Partial<MessageViewMessage>) => {
      const { entities: e, order: o, meta: m } = getSlices(queryClient, cid);
      const result = patchMessageUpdated(e, o, m, messageId, updates);
      applyPatch(queryClient, cid, result);
    },
    [queryClient]
  );

  const optimisticAddReaction = useCallback(
    (cid: string, messageId: string, emoji: string) => {
      if (!currentUserId) return;
      const { entities: e, order: o, meta: m } = getSlices(queryClient, cid);
      const result = patchReactionAdded(e, o, m, messageId, { emoji, userId: currentUserId }, currentUserId);
      applyPatch(queryClient, cid, result);
    },
    [queryClient, currentUserId]
  );

  const optimisticRemoveReaction = useCallback(
    (cid: string, messageId: string, emoji: string) => {
      if (!currentUserId) return;
      const { entities: e, order: o, meta: m } = getSlices(queryClient, cid);
      const result = patchReactionRemoved(e, o, m, messageId, emoji, currentUserId, currentUserId);
      applyPatch(queryClient, cid, result);
    },
    [queryClient, currentUserId]
  );

  const optimisticDeleteMessage = useCallback(
    (cid: string, messageId: string) => {
      const { entities: e, order: o, meta: m } = getSlices(queryClient, cid);
      const result = patchMessageDeleted(e, o, m, messageId);
      applyPatch(queryClient, cid, result);
    },
    [queryClient]
  );

  type MediaPayload = Array<{
    mediaId?: string;
    url: string;
    public_id: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
  }>;

  function mediaPayloadToMediaFiles(payload: MediaPayload): MessageViewMessage['mediaFiles'] {
    if (!payload?.length) return undefined;
    const mimeToType = (m: string): 'image' | 'video' | 'gif' | 'sticker' | 'file' => {
      const lower = (m || '').toLowerCase();
      if (lower === 'image/gif') return 'gif';
      if (lower.startsWith('image/')) return 'image';
      if (lower.startsWith('video/')) return 'video';
      return 'file';
    };
    return payload
      .filter((m) => m?.url)
      .map((m) => ({
        id: m.mediaId || m.public_id || `temp_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        type: mimeToType(m.mimeType ?? ''),
        url: m.url,
        size: m.fileSize,
        mimeType: m.mimeType,
      }));
  }

  const sendMessage = useCallback(
    async (
      content: string,
      replyToMessageId?: string | null,
      media?: MediaPayload
    ) => {
      if (!channelId) return;

      const text = (content ?? '').trim() || ' ';
      const hasMedia = Array.isArray(media) && media.length > 0;
      const nonce =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? (crypto as { randomUUID: () => string }).randomUUID()
          : `nonce_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const tempId = `temp_${nonce}`;
      const clientGeneratedId = tempId;

      const ctx = normalizeContextRef.current;
      const optimisticView: MessageViewMessage = {
        id: tempId,
        content: text,
        createdAt: new Date(),
        editedAt: null,
        author: getAuthorForUserInContext(
          {
            id: currentUser?.id ?? currentUserId ?? '',
            name: currentUser?.name,
            avatarUrl: currentUser?.avatarUrl ?? null,
          },
          ctx
        ),
        replyTo: undefined,
        reactions: [],
        mediaFiles: hasMedia ? mediaPayloadToMediaFiles(media) : undefined,
        clientGeneratedId,
      };

      const { entities: e, order: o, meta: m } = getSlices(queryClient, channelId);
      const stubDto = viewToStubDto(optimisticView);
      const createResult = patchMessageCreated(e, o, m, { dto: stubDto, view: optimisticView });
      applyPatch(queryClient, channelId, createResult);

      try {
        const res = await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            channelId,
            content: text,
            replyToMessageId: replyToMessageId ?? null,
            clientGeneratedId,
            ...(hasMedia && { media }),
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch {
        const { entities: e2, order: o2, meta: m2 } = getSlices(
          queryClient,
          channelId
        );
        const deleteResult = patchMessageDeleted(e2, o2, m2, tempId);
        applyPatch(queryClient, channelId, deleteResult);
      }
    },
    [channelId, queryClient, currentUserId, currentUser]
  );

  const fetchMessagesForChannel = useCallback(() => {
    if (!channelId) return Promise.resolve();
    if (!currentUserId) {
      return fetchMessages(channelId, {}, undefined, 'messages:manual-no-user').then((data) =>
        hydrateMessageViewSlices(queryClient, channelId, data, normalizeContextRef.current)
      );
    }
    return syncChannelMessagesCacheFirst(currentUserId, channelId).then((result) => {
      if (result.cached) {
        hydrateMessageViewSlices(queryClient, channelId, result.cached, normalizeContextRef.current);
      }
      if (result.network) {
        hydrateMessageViewSlices(queryClient, channelId, result.network, normalizeContextRef.current);
      }
    });
  }, [channelId, queryClient, currentUserId]);

  return {
    messages,
    loading: false,
    error: null,
    sendMessage,
    fetchMessages: fetchMessagesForChannel,
    isConnected,
    count,
    hasMore,
    optimisticUpdateMessage,
    optimisticAddReaction,
    optimisticRemoveReaction,
    optimisticDeleteMessage,
  };
}
