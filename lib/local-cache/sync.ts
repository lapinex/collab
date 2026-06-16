'use client';

import { apiGet } from '@/lib/api-client';
import {
  getChannelSyncState,
  getCachedMessages,
  markChannelSynced,
  pruneChannelCache,
  shouldSyncChannel,
  upsertMessagesCache,
} from './messagesRepo';

interface RawApiResponse {
  messages?: import('@/lib/messages/dto').MessageDTO[];
  data?: { messages?: import('@/lib/messages/dto').MessageDTO[] };
  count?: number;
  hasMore?: boolean;
  channelId?: string;
  nextCursor?: string | null;
  serverNow?: number;
}

export interface MessagesQueryData {
  messages: import('@/lib/messages/dto').MessageDTO[];
  count: number;
  hasMore: boolean;
  channelId: string;
  nextCursor: string | null;
  serverNow?: number;
}

const LIMIT = 50;

async function fetchMessagesFromApi(
  channelId: string,
  params?: { offset?: number; after?: number; cursor?: string }
): Promise<MessagesQueryData> {
  const query = new URLSearchParams();
  query.set('channelId', channelId);
  query.set('limit', String(LIMIT));
  if (typeof params?.after === 'number') {
    query.set('after', String(params.after));
  } else if (params?.cursor) {
    query.set('cursor', params.cursor);
  } else {
    query.set('offset', String(params?.offset ?? 0));
  }
  const data = await apiGet<RawApiResponse>(
    `/api/messages?${query.toString()}`
  );
  const messages = Array.isArray(data?.messages)
    ? data.messages
    : Array.isArray(data?.data?.messages)
      ? data.data.messages
      : [];
  return {
    messages,
    count: typeof data?.count === 'number' ? data.count : messages.length,
    hasMore: typeof data?.hasMore === 'boolean' ? data.hasMore : false,
    channelId: (data?.channelId as string) ?? channelId,
    nextCursor: data?.nextCursor ?? null,
    serverNow: data?.serverNow,
  };
}

export interface ChannelSyncResult {
  cached: MessagesQueryData | null;
  network: MessagesQueryData | null;
}

export async function syncChannelMessagesCacheFirst(
  userId: string,
  channelId: string,
  limit = 50
): Promise<ChannelSyncResult> {
  const cachedMessages = await getCachedMessages(userId, channelId, limit);
  const cached: MessagesQueryData | null =
    cachedMessages.length > 0
      ? {
          messages: cachedMessages,
          count: cachedMessages.length,
          hasMore: cachedMessages.length >= limit,
          channelId,
          nextCursor: cachedMessages[0]?.createdAt ?? null,
        }
      : null;

  if (!(await shouldSyncChannel(userId, channelId))) {
    return { cached, network: null };
  }

  const syncState = await getChannelSyncState(userId, channelId);
  const hasBaseline = !!cached && !!syncState?.lastServerTimestamp;
  const network = hasBaseline
    ? await fetchMessagesFromApi(channelId, { after: syncState.lastServerTimestamp })
    : await fetchMessagesFromApi(channelId, { offset: 0 });

  if (network.messages.length > 0) {
    await upsertMessagesCache(userId, channelId, network.messages);
    const latest = network.messages.at(-1)?.createdAt;
    if (latest) {
      await markChannelSynced(userId, channelId, Date.parse(latest));
    }
  } else {
    await markChannelSynced(
      userId,
      channelId,
      syncState?.lastServerTimestamp ?? Date.now()
    );
  }
  await pruneChannelCache(userId, channelId);
  return { cached, network };
}
