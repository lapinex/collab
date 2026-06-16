/**
 * Single normalization layer: MessageDTO → MessageViewMessage.
 * DTO is consumed here and never stored in slices. Media normalized once (url ?? cdnUrl).
 */

import type { MessageDTO } from '@/lib/messages/dto';
import type { MessageViewMessage } from '@/lib/messageView/types';
import type { MediaFile, MediaType } from '@/lib/media/types';
import type { ServerViewMember } from '@/hooks/useServerViewQuery';
import type { DMChannel } from '@/types/dm';
import { getRoleColor } from '@/lib/utils/roles';

export interface NormalizeContext {
  members?: ServerViewMember[];
  dmChannel?: DMChannel;
  currentUser?: { id: string; name: string; avatarUrl: string | null };
  /** For replyTo resolution; key = message id */
  entities?: Record<string, MessageViewMessage>;
}

function parseDate(value: unknown): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }
  return new Date();
}

function normalizeMediaFiles(files: unknown): MediaFile[] {
  if (!Array.isArray(files) || files.length === 0) return [];
  const result: MediaFile[] = [];
  for (const f of files) {
    if (!f || typeof f !== 'object') continue;
    const raw = f as Record<string, unknown>;
    const url = (raw.url ?? raw.cdnUrl ?? '') as string;
    if (!url) continue;
    const mime = (raw.mimeType ?? '') as string;
    const deriveType = (): MediaType => {
      const t = (raw.type ?? '') as string;
      if (['image', 'video', 'gif', 'sticker', 'file'].includes(t)) return t as MediaType;
      const m = mime.toLowerCase();
      if (m === 'image/gif') return 'gif';
      if (m.startsWith('image/')) return 'image';
      if (m.startsWith('video/')) return 'video';
      return 'file';
    };
    result.push({
      id: String(raw.id ?? ''),
      type: deriveType(),
      url,
      size: typeof raw.size === 'number' ? raw.size : undefined,
      mimeType: mime || undefined,
    });
  }
  return result;
}

/** Build author for message view from user + context (server nickname + role color, or DM fallback). */
export function getAuthorForUserInContext(
  user: { id: string; name?: string; avatarUrl?: string | null },
  context: NormalizeContext
): MessageViewMessage['author'] {
  const isServer = Array.isArray(context.members);
  const members = context.members ?? [];
  const fallbackName = user.name ?? 'You';

  if (isServer && members.length > 0) {
    const member = members.find((m) => m.id === user.id);
    const displayName = member?.nickname || member?.name || fallbackName;
    const avatar = member?.avatarUrl ?? user.avatarUrl ?? null;
    const roles = (member?.roles ?? []).map((r) => ({
      id: r.id,
      serverId: '',
      name: r.name,
      color: r.color,
      position: r.position,
      permissions: BigInt(0),
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const roleColor = getRoleColor(roles);
    const firstRole = roles[0];
    const roleName = firstRole ? roles.reduce((h, r) => (r.position > h.position ? r : h), firstRole).name : null;
    return {
      id: user.id,
      username: displayName,
      avatar,
      roleColor,
      roleName,
    };
  }
  return {
    id: user.id,
    username: fallbackName,
    avatar: user.avatarUrl ?? null,
    roleColor: null,
    roleName: null,
  };
}

/**
 * Normalize a single DTO to view model. Server vs DM is inferred from context.members (server) vs context.dmChannel / no members (DM).
 */
export function normalizeDtoToView(
  dto: MessageDTO,
  context: NormalizeContext
): MessageViewMessage {
  const mediaFiles = normalizeMediaFiles(dto.mediaFiles);

  const author = getAuthorForUserInContext(
    { id: dto.user.id, name: dto.user.name, avatarUrl: dto.user.avatarUrl },
    context
  );

  let replyTo: MessageViewMessage['replyTo'] = undefined;
  if (dto.replyToId && context.entities?.[dto.replyToId]) {
    const replyMsg = context.entities[dto.replyToId]!;
    replyTo = {
      messageId: replyMsg.id,
      authorUsername: replyMsg.author.username,
      roleColor: replyMsg.author.roleColor,
      content: replyMsg.content ?? '',
    };
  } else if (dto.replyToId && dto.replyToAuthorUsername != null) {
    replyTo = {
      messageId: dto.replyToId,
      authorUsername: dto.replyToAuthorUsername,
      roleColor: null,
      content: (dto.replyToContent ?? '').slice(0, 200),
    };
  }

  const view: MessageViewMessage = {
    id: dto.id,
    content: dto.content ?? '',
    createdAt: parseDate(dto.createdAt),
    editedAt: dto.editedAt ? parseDate(dto.editedAt) : null,
    author,
    replyTo,
    reactions: dto.reactions ?? [],
    mediaFiles: mediaFiles.length > 0 ? mediaFiles : undefined,
    embeds: dto.embeds && dto.embeds.length > 0 ? dto.embeds : undefined,
    mentions: dto.mentions && dto.mentions.length > 0 ? dto.mentions : undefined,
  };
  if (dto.clientGeneratedId != null) {
    view.clientGeneratedId = dto.clientGeneratedId;
  }
  return view;
}
