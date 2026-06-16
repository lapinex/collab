/**
 * MessageView slice query keys. Single source of truth for message cache.
 * No parent ['messages', channelId] — only these slices.
 */

export const mvEntitiesKey = (channelId: string) =>
  ['mv:entities', channelId] as const;
export const mvOrderKey = (channelId: string) =>
  ['mv:order', channelId] as const;
export const mvMetaKey = (channelId: string) =>
  ['mv:meta', channelId] as const;

export interface MessageViewMeta {
  hasMore: boolean;
  oldestLoadedId: string | null;
  newestLoadedId: string | null;
  oldestCursor: string | null;
}
