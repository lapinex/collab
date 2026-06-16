import type { MediaFile } from '@/lib/media/types';

/** Structured mention (user, role, or @everyone). Stored in DTO and view; UI does not parse. */
export type MessageMention =
  | { type: 'user'; id: string; label?: string }
  | { type: 'role'; id: string; label?: string }
  | { type: 'everyone'; label?: string };

/** Link embed metadata (og:title, og:description, etc.). Cached in Redis by URL. */
export interface Embed {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

/**
 * Single DTO for all message sources: API, realtime, optimistic.
 * All APIs and DMSession use only this shape. Media: only mediaFiles (unified MediaFile).
 */
export interface MessageDTO {
  id: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  user: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
  replyToId: string | null;
  /** When reply target is not in the same batch; from API. */
  replyToAuthorUsername?: string;
  replyToContent?: string;
  reactions: {
    emoji: string;
    count: number;
    reactedByMe: boolean;
  }[];
  /** Optional. Unified media; server and UI use only this. */
  mediaFiles?: MediaFile[];
  /** Optional. Link embeds (first URL in content). */
  embeds?: Embed[];
  /** Optional. Resolved mentions (user id, role id, or everyone). Parsed and resolved in pipeline. */
  mentions?: MessageMention[];
  /** Echoed from POST for client-side optimistic deduplication. */
  clientGeneratedId?: string;
}

/** Build MessageDTO.reactions from raw reaction rows (e.g. from DB join). */
export function buildReactionsDTO(
  rows: Array<{ emoji: string; userId: string }>,
  currentUserId: string | undefined
): MessageDTO['reactions'] {
  const byEmoji = new Map<string, { count: number; userIds: Set<string> }>();
  for (const r of rows) {
    const entry = byEmoji.get(r.emoji) ?? { count: 0, userIds: new Set<string>() };
    entry.count++;
    entry.userIds.add(r.userId);
    byEmoji.set(r.emoji, entry);
  }
  return Array.from(byEmoji.entries()).map(([emoji, data]) => ({
    emoji,
    count: data.count,
    reactedByMe: !!currentUserId && data.userIds.has(currentUserId),
  }));
}
