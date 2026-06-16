'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api-client';
import type { MessageDTO } from '@/lib/messages/dto';
import { useAuthStore } from '@/stores/auth-store';
import { selectUserId } from '@/stores/auth.selectors';
import { upsertMessagesCache, markChannelSynced, pruneChannelCache } from '@/lib/local-cache/messagesRepo';
import { clientEnv } from '@/lib/env/clientEnv';
import { messagesInfiniteQueryKey } from '@/lib/messages/keys';

export interface MessagesQueryData {
  messages: MessageDTO[];
  count: number;
  hasMore: boolean;
  channelId: string;
  nextCursor: string | null;
  deprecatedOffsetUsed?: boolean;
}

const LIMIT = 50;

export function messagesQueryKey(channelId: string | null) {
  return messagesInfiniteQueryKey(channelId);
}

interface RawApiResponse {
  messages?: MessageDTO[];
  data?: { messages?: MessageDTO[] };
  count?: number;
  hasMore?: boolean;
  channelId?: string;
  nextCursor?: string | null;
  deprecatedOffsetUsed?: boolean;
}

const inflightMessageFetches = new Map<string, Promise<MessagesQueryData>>();

export async function fetchMessages(
  channelId: string,
  params: { offset?: number; cursor?: string | null } = {},
  userId?: string,
  source = 'unknown'
): Promise<MessagesQueryData> {
  const offset = params.offset ?? 0;
  const cursor = params.cursor ?? null;
  const query = new URLSearchParams({
    channelId,
    limit: String(LIMIT),
  });
  if (cursor) {
    query.set('cursor', cursor);
  } else if (params.offset != null) {
    query.set('offset', String(offset));
  }
  const requestKey = `${channelId}|${cursor ?? `offset:${offset}`}`;
  const existing = inflightMessageFetches.get(requestKey);
  if (existing) {
    if (clientEnv.nodeEnv === 'development') {
      console.debug('[messages] reuse inflight request', { channelId, cursor, offset, source });
    }
    return existing;
  }

  const requestPromise = (async (): Promise<MessagesQueryData> => {
    if (clientEnv.nodeEnv === 'development') {
      console.debug('[messages] fetch', { channelId, cursor, offset, source });
    }

    const data = await apiGet<RawApiResponse>(
      `/api/messages?${query.toString()}`
    );
    const messages: MessageDTO[] = Array.isArray(data?.messages)
      ? data.messages
      : Array.isArray(data?.data?.messages)
        ? data.data.messages
        : [];
    const result = {
      messages,
      count: typeof data?.count === 'number' ? data.count : messages.length,
      hasMore: typeof data?.hasMore === 'boolean' ? data.hasMore : false,
      channelId: (data?.channelId as string) ?? channelId,
      nextCursor: typeof data?.nextCursor === 'string' ? data.nextCursor : null,
      deprecatedOffsetUsed: !!data?.deprecatedOffsetUsed,
    };
    if (result.deprecatedOffsetUsed && clientEnv.nodeEnv !== 'production') {
      console.warn('[messages] offset pagination is deprecated; switch callers to cursor', {
        channelId,
        offset,
        source,
      });
    }
    if (userId && !cursor && offset === 0 && messages.length > 0) {
      await upsertMessagesCache(userId, channelId, messages);
      const latest = messages.at(-1)?.createdAt;
      if (latest) {
        await markChannelSynced(userId, channelId, Date.parse(latest));
      }
      await pruneChannelCache(userId, channelId);
    }
    return result;
  })();

  inflightMessageFetches.set(requestKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    inflightMessageFetches.delete(requestKey);
  }
}

/**
 * TanStack Query hook for channel messages.
 * Uses GET /api/messages?channelId=...&limit=50. Returns MessageDTO[] (consumed by normalizeDtoToView, not stored as DTO).
 */
export function useMessagesQuery(channelId: string | null) {
  const userId = useAuthStore(selectUserId);
  return useInfiniteQuery({
    queryKey: messagesQueryKey(channelId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      fetchMessages(
        channelId!,
        pageParam ? { cursor: pageParam } : {},
        userId ?? undefined,
        pageParam ? 'query:useMessagesQuery:older' : 'query:useMessagesQuery:initial'
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!channelId,
  });
}
