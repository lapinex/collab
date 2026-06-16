'use client';

import { useCallback } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import {
  MESSAGE_TAGS,
  channelsListQueryKey,
  messagesInfiniteQueryKey,
  serversListQueryKey,
  type RevalidateTag,
} from '@/lib/messages/keys';

function tagToQueryKeys(
  tag: RevalidateTag,
  context?: { channelId?: string | null; serverId?: string | null }
): QueryKey[] {
  switch (tag) {
    case MESSAGE_TAGS.messages:
      return [messagesInfiniteQueryKey(context?.channelId ?? null)];
    case MESSAGE_TAGS.channels:
      return [channelsListQueryKey(context?.serverId ?? null)];
    case MESSAGE_TAGS.servers:
      return [serversListQueryKey()];
    default:
      return [];
  }
}

export function useRevalidate(context?: { channelId?: string | null; serverId?: string | null }) {
  const queryClient = useQueryClient();

  const revalidateTags = useCallback(
    async (tags: RevalidateTag[]) => {
      const keys = tags.flatMap((tag) => tagToQueryKeys(tag, context));
      await Promise.all(
        keys.map((queryKey) =>
          queryClient.invalidateQueries({
            queryKey,
          })
        )
      );
    },
    [context, queryClient]
  );

  return { revalidateTags };
}
