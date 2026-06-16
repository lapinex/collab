'use client';

import { useEffect, useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchMessages } from './useMessagesQuery';
import type { QueryClient } from '@tanstack/react-query';
import {
  mvEntitiesKey,
  mvOrderKey,
  mvMetaKey,
  type MessageViewMeta,
} from '@/lib/message-view/keys';
import type { EntitiesSlice } from '@/lib/message-view/patchers';
import { getViewsMap } from '@/lib/message-view/patchers';
import type { MessageDTO } from '@/lib/messages/dto';
import type { MessageViewMessage } from '@/lib/messageView/types';
import type { MessagesQueryData } from './useMessagesQuery';
import { normalizeDtoToView, type NormalizeContext } from '@/lib/messages/normalizeDtoToView';

function viewToStubDto(view: MessageViewMessage): MessageDTO {
  return {
    id: view.id,
    content: view.content,
    createdAt: view.createdAt instanceof Date ? view.createdAt.toISOString() : String(view.createdAt),
    editedAt: view.editedAt instanceof Date ? view.editedAt.toISOString() : view.editedAt ?? null,
    user: { id: view.author.id, name: view.author.username, avatarUrl: view.author.avatar ?? null },
    replyToId: null,
    reactions: view.reactions ?? [],
    mediaFiles: view.mediaFiles,
    clientGeneratedId: view.clientGeneratedId,
  };
}

function hydrateSlices(
  queryClient: QueryClient,
  channelId: string,
  data: MessagesQueryData,
  context: NormalizeContext
) {
  const dtos = data.messages ?? [];
  const sortedOldestToNewest = [...dtos].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const order = sortedOldestToNewest.map((m) => m.id);
  const meta: MessageViewMeta = {
    hasMore: data.hasMore ?? false,
    oldestLoadedId: order[0] ?? null,
    newestLoadedId: order[order.length - 1] ?? null,
    oldestCursor:
      data.nextCursor ??
      (sortedOldestToNewest[0]?.createdAt ? new Date(sortedOldestToNewest[0].createdAt).toISOString() : null),
  };
  const currentEntities = (queryClient.getQueryData(mvEntitiesKey(channelId)) as EntitiesSlice) ?? {};
  const currentOrder = (queryClient.getQueryData(mvOrderKey(channelId)) as string[]) ?? [];
  const currentMeta = (queryClient.getQueryData(mvMetaKey(channelId)) as MessageViewMeta) ?? {
    hasMore: false,
    oldestLoadedId: null,
    newestLoadedId: null,
    oldestCursor: null,
  };

  const sameOrder =
    currentOrder.length === order.length &&
    currentOrder.every((id, idx) => id === order[idx]);

  if (sameOrder) {
    let entitiesChanged = false;
    let requiresFullHydrate = false;
    const nextEntities: EntitiesSlice = { ...currentEntities };
    const viewsForContext: Record<string, MessageViewMessage> = { ...getViewsMap(currentEntities) };

    for (const dto of sortedOldestToNewest) {
      const existing = currentEntities[dto.id];
      if (!existing) {
        requiresFullHydrate = true;
        break;
      }

      if (!isEquivalentMessageDto(existing.dto, dto)) {
        const view = normalizeDtoToView(dto, { ...context, entities: viewsForContext });
        nextEntities[dto.id] = { dto, view };
        viewsForContext[dto.id] = view;
        entitiesChanged = true;
      } else {
        viewsForContext[dto.id] = existing.view;
      }
    }

    if (!requiresFullHydrate) {
      if (entitiesChanged) {
        queryClient.setQueryData(mvEntitiesKey(channelId), nextEntities);
      }
      if (!isEquivalentMeta(currentMeta, meta)) {
        queryClient.setQueryData(mvMetaKey(channelId), meta);
      }
      return;
    }
  }

  const entities: EntitiesSlice = {};
  for (const dto of sortedOldestToNewest) {
    const view = normalizeDtoToView(dto, { ...context, entities: getViewsMap(entities) });
    entities[dto.id] = { dto, view };
  }
  queryClient.setQueryData(mvEntitiesKey(channelId), entities);
  queryClient.setQueryData(mvOrderKey(channelId), order);
  queryClient.setQueryData(mvMetaKey(channelId), meta);
}

function isEquivalentMeta(a: MessageViewMeta, b: MessageViewMeta): boolean {
  return (
    a.hasMore === b.hasMore &&
    a.oldestLoadedId === b.oldestLoadedId &&
    a.newestLoadedId === b.newestLoadedId &&
    a.oldestCursor === b.oldestCursor
  );
}

function isEquivalentMessageDto(a: MessageDTO, b: MessageDTO): boolean {
  if (
    a.id !== b.id ||
    a.content !== b.content ||
    a.createdAt !== b.createdAt ||
    a.editedAt !== b.editedAt ||
    a.replyToId !== b.replyToId ||
    a.replyToAuthorUsername !== b.replyToAuthorUsername ||
    a.replyToContent !== b.replyToContent ||
    a.clientGeneratedId !== b.clientGeneratedId
  ) {
    return false;
  }

  if (
    a.user.id !== b.user.id ||
    a.user.name !== b.user.name ||
    (a.user.avatarUrl ?? null) !== (b.user.avatarUrl ?? null)
  ) {
    return false;
  }

  const aReactions = a.reactions ?? [];
  const bReactions = b.reactions ?? [];
  if (aReactions.length !== bReactions.length) return false;
  for (let i = 0; i < aReactions.length; i += 1) {
    const ar = aReactions[i];
    const br = bReactions[i];
    if (!ar || !br) return false;
    if (ar.emoji !== br.emoji || ar.count !== br.count || ar.reactedByMe !== br.reactedByMe) {
      return false;
    }
  }

  const aMedia = a.mediaFiles ?? [];
  const bMedia = b.mediaFiles ?? [];
  if (aMedia.length !== bMedia.length) return false;
  for (let i = 0; i < aMedia.length; i += 1) {
    const am = aMedia[i];
    const bm = bMedia[i];
    if (!am || !bm) return false;
    if (
      am.id !== bm.id ||
      am.type !== bm.type ||
      am.url !== bm.url ||
      (am.mimeType ?? null) !== (bm.mimeType ?? null) ||
      (am.size ?? null) !== (bm.size ?? null)
    ) {
      return false;
    }
  }

  return true;
}

function prependOlderMessages(
  queryClient: QueryClient,
  channelId: string,
  data: MessagesQueryData,
  context: NormalizeContext
): void {
  const entities = (queryClient.getQueryData(mvEntitiesKey(channelId)) as EntitiesSlice) ?? {};
  const order = (queryClient.getQueryData(mvOrderKey(channelId)) as string[]) ?? [];
  const meta = (queryClient.getQueryData(mvMetaKey(channelId)) as MessageViewMeta) ?? {
    hasMore: false,
    oldestLoadedId: null,
    newestLoadedId: null,
    oldestCursor: null,
  };

  const dtos = data.messages ?? [];
  const sortedOldestToNewest = [...dtos].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  if (sortedOldestToNewest.length === 0) {
    queryClient.setQueryData(mvMetaKey(channelId), {
      ...meta,
      hasMore: data.hasMore ?? false,
      oldestCursor: data.nextCursor ?? meta.oldestCursor ?? null,
    });
    return;
  }

  const newEntities: EntitiesSlice = {};
  const viewsForContext: Record<string, MessageViewMessage> = { ...getViewsMap(entities) };
  for (const dto of sortedOldestToNewest) {
    const view = normalizeDtoToView(dto, { ...context, entities: viewsForContext });
    newEntities[dto.id] = { dto, view };
    viewsForContext[dto.id] = view;
  }
  const newOrder = sortedOldestToNewest.map((m) => m.id);
  const mergedEntities = { ...newEntities, ...entities };
  const mergedOrder = [...newOrder, ...order];
  const newMeta: MessageViewMeta = {
    hasMore: data.hasMore ?? false,
    oldestLoadedId: mergedOrder[0] ?? null,
    newestLoadedId: meta.newestLoadedId ?? mergedOrder[mergedOrder.length - 1] ?? null,
    oldestCursor:
      data.nextCursor ??
      (sortedOldestToNewest[0]?.createdAt ? new Date(sortedOldestToNewest[0].createdAt).toISOString() : meta.oldestCursor ?? null),
  };
  queryClient.setQueryData(mvEntitiesKey(channelId), mergedEntities);
  queryClient.setQueryData(mvOrderKey(channelId), mergedOrder);
  queryClient.setQueryData(mvMetaKey(channelId), newMeta);
}

/**
 * Re-normalize all visible messages with new context (e.g. after members load). In-place, no refetch.
 */
export function renormalizeAll(
  queryClient: QueryClient,
  channelId: string,
  newContext: NormalizeContext
): void {
  const entities = (queryClient.getQueryData(mvEntitiesKey(channelId)) as EntitiesSlice) ?? {};
  const order = (queryClient.getQueryData(mvOrderKey(channelId)) as string[]) ?? [];
  if (order.length === 0) return;

  const nextEntities: EntitiesSlice = {};
  const viewsForContext: Record<string, MessageViewMessage> = {};
  for (const id of order) {
    const entry = entities[id];
    const dto =
      entry && 'dto' in entry && entry.dto
        ? entry.dto
        : entry && 'id' in entry && 'author' in entry
          ? viewToStubDto(entry as unknown as MessageViewMessage)
          : null;
    if (!dto) continue;
    const view = normalizeDtoToView(dto, { ...newContext, entities: viewsForContext });
    nextEntities[id] = { dto, view };
    viewsForContext[id] = view;
  }
  queryClient.setQueryData(mvEntitiesKey(channelId), nextEntities);
}

export interface UseMessageViewSlicesOptions {
  channelId: string | null;
  /** Required for normalization. Server: pass members. DM: pass dmChannel + currentUser. */
  normalizeContext: NormalizeContext;
}

/**
 * Fetches channel messages (API), normalizes DTO → MessageViewMessage, fills slices.
 * Slices store only MessageViewMessage. DTO is not stored.
 */
export function useMessageViewSlices(options: UseMessageViewSlicesOptions) {
  const { channelId, normalizeContext } = options;
  const queryClient = useQueryClient();
  const contextRef = useRef(normalizeContext);
  contextRef.current = normalizeContext;
  const [isLoading, setIsLoading] = useState(!!channelId);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!channelId) {
      setIsLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchMessages(channelId, {}, undefined, 'slices:initial')
      .then((data) => {
        if (cancelled) return;
        hydrateSlices(queryClient, channelId, data, contextRef.current);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
  }, [channelId, queryClient]);

  const refetch = () => {
    if (!channelId) return Promise.resolve();
    return fetchMessages(channelId, {}, undefined, 'slices:refetch').then((data) =>
      hydrateSlices(queryClient, channelId, data, contextRef.current)
    );
  };

  const renormalizeAllWithContext = (normalizeContext: NormalizeContext) => {
    if (!channelId) return;
    renormalizeAll(queryClient, channelId, normalizeContext);
  };

  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreOlder = () => {
    if (!channelId || loadingMore) return;
    const meta = (queryClient.getQueryData(mvMetaKey(channelId)) as MessageViewMeta) ?? {
      hasMore: false,
      oldestLoadedId: null,
      newestLoadedId: null,
      oldestCursor: null,
    };
    if (!meta.hasMore || !meta.oldestCursor) return;
    setLoadingMore(true);
    fetchMessages(channelId, { cursor: meta.oldestCursor }, undefined, 'slices:older')
      .then((data) => {
        prependOlderMessages(queryClient, channelId, data, contextRef.current);
      })
      .finally(() => setLoadingMore(false));
  };

  return {
    isLoading,
    error,
    refetch,
    renormalizeAll: renormalizeAllWithContext,
    loadMoreOlder,
    loadingMore,
  };
}

/** Re-hydrate slices from API result. Caller must pass same context as useMessageViewSlices. */
export function hydrateMessageViewSlices(
  queryClient: QueryClient,
  channelId: string,
  data: MessagesQueryData,
  context: NormalizeContext
) {
  hydrateSlices(queryClient, channelId, data, context);
}
