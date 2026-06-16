/**
 * Pure patchers for MessageView slices. Slices store { dto, view } for in-place re-normalize.
 * MessageList consumes only .view. Deduplication by clientGeneratedId (optimistic → server).
 */

import type { MessageDTO } from '@/lib/messages/dto';
import type { MessageViewMessage } from '@/lib/messageView/types';
import type { MessageViewMeta } from './keys';

export interface EntityEntry {
  dto: MessageDTO;
  view: MessageViewMessage;
}

export type EntitiesSlice = Record<string, EntityEntry>;
export type OrderSlice = string[];

/** Get view map for NormalizeContext.entities (replyTo resolution). */
export function getViewsMap(entities: EntitiesSlice): Record<string, MessageViewMessage> {
  const out: Record<string, MessageViewMessage> = {};
  for (const id of Object.keys(entities)) {
    const e = entities[id];
    if (e?.view) out[id] = e.view;
  }
  return out;
}

/**
 * Add a new message (realtime create or optimistic send).
 * If an optimistic message with matching clientGeneratedId exists, replace it.
 * Otherwise if id already exists, no-op. Else append.
 */
export function patchMessageCreated(
  entities: EntitiesSlice,
  order: OrderSlice,
  meta: MessageViewMeta,
  entry: EntityEntry
): { entities: EntitiesSlice; order: OrderSlice; meta: MessageViewMeta } {
  const { view } = entry;
  const id = view.id;
  const optimisticId =
    view.clientGeneratedId != null
      ? Object.keys(entities).find((eid) => entities[eid]?.view?.clientGeneratedId === view.clientGeneratedId)
      : undefined;
  const replaceId = optimisticId ?? null;

  if (replaceId != null) {
    const viewWithoutCid = { ...view };
    delete (viewWithoutCid as Partial<MessageViewMessage>).clientGeneratedId;
    const entryToSet: EntityEntry = { dto: entry.dto, view: viewWithoutCid };
    const { [replaceId]: _, ...rest } = entities;
    const newEntities: EntitiesSlice = { ...rest, [id]: entryToSet };
    const newOrder = order.map((eid) => (eid === replaceId ? id : eid));
    const newMeta: MessageViewMeta = { ...meta, newestLoadedId: id };
    return { entities: newEntities, order: newOrder, meta: newMeta };
  }

  if (entities[id] != null) return { entities, order, meta };

  // Append (e.g. optimistic): keep clientGeneratedId in view so realtime can replace by it
  const newEntities: EntitiesSlice = { ...entities, [id]: { dto: entry.dto, view: { ...view } } };
  const newOrder = [...order, id];
  const newMeta: MessageViewMeta = { ...meta, newestLoadedId: id };
  return { entities: newEntities, order: newOrder, meta: newMeta };
}

/**
 * Update an existing message (realtime edit or optimistic edit).
 * DTO is source of truth for renormalize: any field that participates in normalize must be synced to dto.
 */
export function patchMessageUpdated(
  entities: EntitiesSlice,
  _order: OrderSlice,
  _meta: MessageViewMeta,
  messageId: string,
  updates: Partial<MessageViewMessage>
): { entities: EntitiesSlice } {
  const existing = entities[messageId];
  if (!existing) return { entities };
  const updatedView = { ...existing.view, ...updates, id: messageId };
  const updatedDto = { ...existing.dto };
  if (updates.content !== undefined) updatedDto.content = updates.content;
  if (updates.editedAt !== undefined)
    updatedDto.editedAt =
      updates.editedAt instanceof Date ? updates.editedAt.toISOString() : (updates.editedAt as string | null);
  if (updates.reactions !== undefined) updatedDto.reactions = updates.reactions;
  if (updates.mediaFiles !== undefined) updatedDto.mediaFiles = updates.mediaFiles;
  if (updates.embeds !== undefined) updatedDto.embeds = updates.embeds;
  return { entities: { ...entities, [messageId]: { dto: updatedDto, view: updatedView } } };
}

/**
 * Remove a message (realtime delete or revert optimistic create).
 */
export function patchMessageDeleted(
  entities: EntitiesSlice,
  order: OrderSlice,
  meta: MessageViewMeta,
  messageId: string
): { entities: EntitiesSlice; order: OrderSlice; meta: MessageViewMeta } {
  const { [messageId]: _, ...newEntities } = entities;
  const newOrder = order.filter((id) => id !== messageId);
  const newMeta: MessageViewMeta = {
    ...meta,
    oldestLoadedId: newOrder[0] ?? null,
    newestLoadedId: newOrder[newOrder.length - 1] ?? null,
  };
  return { entities: newEntities, order: newOrder, meta: newMeta };
}

/**
 * Add a reaction to a message. DTO.reactions kept in sync for renormalize.
 */
export function patchReactionAdded(
  entities: EntitiesSlice,
  _order: OrderSlice,
  _meta: MessageViewMeta,
  messageId: string,
  payload: { emoji: string; userId: string },
  currentUserId: string | undefined
): { entities: EntitiesSlice } {
  const existing = entities[messageId];
  if (!existing) return { entities };
  const reactions = [...(existing.view.reactions ?? [])];
  const idx = reactions.findIndex((r) => r.emoji === payload.emoji);
  if (idx >= 0) {
    const cur = reactions[idx]!;
    reactions[idx] = {
      emoji: cur.emoji,
      count: cur.count + 1,
      reactedByMe: cur.reactedByMe || payload.userId === currentUserId,
    };
  } else {
    reactions.push({
      emoji: payload.emoji,
      count: 1,
      reactedByMe: payload.userId === currentUserId,
    });
  }
  const updatedView = { ...existing.view, reactions };
  const updatedDto = { ...existing.dto, reactions };
  return { entities: { ...entities, [messageId]: { dto: updatedDto, view: updatedView } } };
}

/**
 * Remove a reaction. DTO.reactions kept in sync for renormalize.
 */
export function patchReactionRemoved(
  entities: EntitiesSlice,
  _order: OrderSlice,
  _meta: MessageViewMeta,
  messageId: string,
  emoji: string,
  userId: string,
  currentUserId: string | undefined
): { entities: EntitiesSlice } {
  const existing = entities[messageId];
  if (!existing) return { entities };
  const reactions = (existing.view.reactions ?? [])
    .map((r) => {
      if (r.emoji !== emoji) return r;
      const newCount = Math.max(0, r.count - 1);
      return { emoji: r.emoji, count: newCount, reactedByMe: userId === currentUserId ? false : r.reactedByMe };
    })
    .filter((r) => r.count > 0);
  const updatedView = { ...existing.view, reactions };
  const updatedDto = { ...existing.dto, reactions };
  return { entities: { ...entities, [messageId]: { dto: updatedDto, view: updatedView } } };
}
