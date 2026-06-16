/**
 * Realtime → View Patch Adapter.
 * Maps server view realtime events to patchers; no API/hooks/builders changes.
 * Use: setQueryData(key, old => old ? applyServerViewRealtimeEvent(old, event) : old)
 */
import type { ServerViewData } from '@/hooks/useServerViewQuery';
import type {
  Channel,
  Role,
  ServerEmoji,
  Webhook,
} from '@/types/server';
import type { MembersPreviewItem } from './serverView.patcher';
import {
  patchChannels,
  patchRoles,
  patchMember,
  patchEmojis,
  patchWebhooks,
} from './serverView.patcher';

/** Realtime event for server view cache. Payloads match what patchers expect; delete events need at least id. */
export type ServerViewRealtimeEvent =
  | { action: 'channel_created'; channel: Channel }
  | { action: 'channel_updated'; channel: Channel }
  | { action: 'channel_deleted'; channel: Pick<Channel, 'id'> }
  | { action: 'role_updated'; role: Role }
  | { action: 'member_updated'; member: MembersPreviewItem }
  | { action: 'emoji_created'; emoji: ServerEmoji }
  | { action: 'emoji_deleted'; emoji: Pick<ServerEmoji, 'id'> }
  | { action: 'webhook_deleted'; webhook: Pick<Webhook, 'id'> };

/**
 * Applies a single realtime event to the current server view cache.
 * Pure: returns new ServerViewData, does not mutate view.
 * Unknown event action returns view unchanged.
 */
export function applyServerViewRealtimeEvent(
  view: ServerViewData,
  event: ServerViewRealtimeEvent
): ServerViewData {
  switch (event.action) {
    case 'channel_created':
      return patchChannels(view, event.channel, 'add');
    case 'channel_updated':
      return patchChannels(view, event.channel, 'update');
    case 'channel_deleted':
      return patchChannels(view, event.channel as Channel, 'remove');
    case 'role_updated':
      return patchRoles(view, event.role);
    case 'member_updated':
      return patchMember(view, event.member);
    case 'emoji_created':
      return patchEmojis(view, event.emoji, 'add');
    case 'emoji_deleted':
      return patchEmojis(view, event.emoji as ServerEmoji, 'remove');
    case 'webhook_deleted':
      return patchWebhooks(view, event.webhook as Webhook, 'remove');
    default: {
      const _: never = event;
      void _;
      return view;
    }
  }
}
