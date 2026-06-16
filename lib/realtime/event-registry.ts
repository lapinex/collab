/**
 * Typed event registry for realtime routing.
 * Routes by contract (scope + channelId/dmId), not by guessing payload shape.
 */

export type RealtimeScope = 'channel' | 'dm' | 'presence' | 'user';

export interface RealtimeEventBase {
  scope: RealtimeScope;
  channelId?: string;
  dmId?: string;
  entityId?: string;
  version?: number;
}

const DM_CALL_EVENTS = new Set<string>(['call_offer', 'call_accept', 'call_reject', 'call_end']);
const PRESENCE_EVENTS = new Set<string>(['presence:update', 'USER_PRESENCE_UPDATE']);
const CHANNEL_EVENTS = new Set<string>([
  'message',
  'message:updated',
  'message:deleted',
  'message_reaction_added',
  'message_reaction_removed',
  'participant_moderated',
  'voice:joined',
  'voice:left',
  'activity',
]);
const USER_EVENTS = new Set<string>([
  'notification:new',
  'server:member_joined',
  'server:member_removed',
  'server:kicked',
  'server:banned',
  'server:role_added',
  'server:role_removed',
]);

const VALID_SCOPES: RealtimeScope[] = ['channel', 'dm', 'presence', 'user'];

/**
 * Parses explicit scope from payload if present and valid.
 * Returns null if payload has no scope or scope is invalid.
 */
export function parseExplicitScope(payload: unknown): RealtimeScope | null {
  if (!payload || typeof payload !== 'object') return null;
  const scope = (payload as Record<string, unknown>).scope;
  if (typeof scope !== 'string' || !VALID_SCOPES.includes(scope as RealtimeScope)) return null;
  return scope as RealtimeScope;
}

/**
 * Infers scope from event name and payload.
 * Backend may add explicit `scope` in future; for now we infer.
 */
export function inferScope(event: string, _payload: unknown): RealtimeScope | null {
  if (DM_CALL_EVENTS.has(event)) return 'dm';
  if (PRESENCE_EVENTS.has(event)) return 'presence';
  if (USER_EVENTS.has(event)) return 'user';
  if (CHANNEL_EVENTS.has(event)) return 'channel';
  return null;
}

/**
 * Returns routing id for the given scope (channelId or dmId).
 */
export function getRoutingId(scope: RealtimeScope, payload: Record<string, unknown>): string | null {
  const channelId = typeof payload.channelId === 'string' ? payload.channelId : null;
  const dmId = typeof payload.dmId === 'string' ? payload.dmId : null;
  const userId = typeof payload.userId === 'string' ? payload.userId : null;

  switch (scope) {
    case 'channel':
      return channelId;
    case 'dm':
      return channelId ?? dmId;
    case 'presence':
      return null;
    case 'user':
      return userId;
    default:
      return null;
  }
}
