/**
 * Smart ServerView cache patching layer.
 * Pure functions to update cache via queryClient.setQueryData(['serverView', id], old => patchX(old, data)).
 * No refetch, no mutation of input.
 */
import type { ServerViewData, ServerViewMember } from '@/hooks/useServerViewQuery';
import type {
  Channel,
  Role,
  ServerEmoji,
  ServerSticker,
  Webhook,
} from '@/types/server';

/** API shape for member (avatar, no email); mapped to ServerViewMember in cache. */
export interface MembersPreviewItem {
  id: string;
  userId: string;
  name: string;
  nickname: string | null;
  roles: Array<{ id: string; name: string; color: string; position: number }>;
  avatar: string | null;
  isOwner: boolean;
}

// --- Private sort helpers (match builders) ---

function sortChannels(channels: Channel[]): Channel[] {
  return [...channels].sort((a, b) => {
    const pos = a.position - b.position;
    if (pos !== 0) return pos;
    const tA = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
    const tB = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
    return tA - tB;
  });
}

function sortRoles(roles: Role[]): Role[] {
  return [...roles].sort((a, b) => b.position - a.position);
}

function sortMembers(members: ServerViewMember[], ownerId: string | undefined): ServerViewMember[] {
  return [...members].sort((a, b) => {
    if (ownerId && a.id === ownerId) return -1;
    if (ownerId && b.id === ownerId) return 1;
    const aMax = a.roles?.length ? Math.max(...a.roles.map((r) => r.position)) : 0;
    const bMax = b.roles?.length ? Math.max(...b.roles.map((r) => r.position)) : 0;
    return bMax - aMax;
  });
}

function sortEmojis(emojis: ServerEmoji[]): ServerEmoji[] {
  return [...emojis].sort((a, b) => a.name.localeCompare(b.name));
}

function sortStickers(stickers: ServerSticker[]): ServerSticker[] {
  return [...stickers].sort((a, b) => a.name.localeCompare(b.name));
}

function sortWebhooks(webhooks: Webhook[]): Webhook[] {
  return [...webhooks].sort((a, b) => a.name.localeCompare(b.name));
}

/** Map API member shape to cache member shape. */
function toServerViewMember(m: MembersPreviewItem): ServerViewMember {
  return {
    id: m.userId,
    name: m.name,
    email: '',
    avatarUrl: m.avatar,
    nickname: m.nickname,
    roles: m.roles ?? [],
    isOwner: m.isOwner,
  };
}

// --- Public patchers ---

export function patchChannels(
  view: ServerViewData,
  channel: Channel,
  type: 'add' | 'update' | 'remove'
): ServerViewData {
  const channels = view.channels ?? [];
  let newChannels: Channel[];
  if (type === 'remove') {
    newChannels = channels.filter((c) => c.id !== channel.id);
  } else if (type === 'update') {
    newChannels = channels.map((c) => (c.id === channel.id ? channel : c));
  } else {
    newChannels = [...channels, channel];
  }
  return {
    ...view,
    channels: sortChannels(newChannels),
  };
}

export function patchRoles(view: ServerViewData, role: Role): ServerViewData {
  const roles = view.roles ?? [];
  const newRoles = roles.map((r) => (r.id === role.id ? role : r));
  return {
    ...view,
    roles: sortRoles(newRoles),
  };
}

export function patchMember(
  view: ServerViewData,
  member: MembersPreviewItem
): ServerViewData {
  const members = view.members ?? [];
  const mapped = toServerViewMember(member);
  const ownerId = view.server?.ownerId;
  const idx = members.findIndex((m) => m.id === member.userId);
  const newMembers =
    idx === -1
      ? [...members, mapped]
      : members.map((m) => (m.id === member.userId ? mapped : m));
  return {
    ...view,
    members: sortMembers(newMembers, ownerId),
  };
}

export function patchEmojis(
  view: ServerViewData,
  emoji: ServerEmoji,
  type: 'add' | 'remove' | 'update'
): ServerViewData {
  const emojis = view.emojis ?? [];
  let newEmojis: ServerEmoji[];
  if (type === 'remove') {
    newEmojis = emojis.filter((e) => e.id !== emoji.id);
  } else if (type === 'update') {
    newEmojis = emojis.map((e) => (e.id === emoji.id ? emoji : e));
  } else {
    newEmojis = [...emojis, emoji];
  }
  return {
    ...view,
    emojis: sortEmojis(newEmojis),
  };
}

export function patchStickers(
  view: ServerViewData,
  sticker: ServerSticker,
  type: 'add' | 'remove' | 'update'
): ServerViewData {
  const stickers = view.stickers ?? [];
  let newStickers: ServerSticker[];
  if (type === 'remove') {
    newStickers = stickers.filter((s) => s.id !== sticker.id);
  } else if (type === 'update') {
    newStickers = stickers.map((s) => (s.id === sticker.id ? sticker : s));
  } else {
    newStickers = [...stickers, sticker];
  }
  return {
    ...view,
    stickers: sortStickers(newStickers),
  };
}

export function patchWebhooks(
  view: ServerViewData,
  webhook: Webhook,
  type: 'add' | 'remove' | 'update'
): ServerViewData {
  const webhooks = view.webhooks ?? [];
  let newWebhooks: Webhook[];
  if (type === 'remove') {
    newWebhooks = webhooks.filter((w) => w.id !== webhook.id);
  } else if (type === 'update') {
    newWebhooks = webhooks.map((w) => (w.id === webhook.id ? webhook : w));
  } else {
    newWebhooks = [...webhooks, webhook];
  }
  return {
    ...view,
    webhooks: sortWebhooks(newWebhooks),
  };
}
