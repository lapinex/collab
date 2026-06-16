/**
 * Mentions: parse @username, @rolename, @everyone from content; resolve to MessageMention[] in pipeline.
 * UI only consumes DTO.mentions / view.mentions.
 */
import type { MessageMention } from '@/lib/messages/dto';

/** Raw parsed mention (no id yet). @token = user, @&token = role (resolved in resolveMentions). */
export type ParsedMention =
  | { type: 'user'; raw: string }
  | { type: 'role'; raw: string }
  | { type: 'everyone' };

const EVERYONE_PATTERN = /@everyone\b/gi;
/** Chars allowed in mention (Latin, digits, underscore, Cyrillic). \b would not work for Cyrillic in JS. */
const MENTION_CHAR_CLASS = '[a-zA-Z0-9_\u0400-\u04FF]';
/** End of mention: next char is not in set, or end of string */
const MENTION_END = '(?=[^a-zA-Z0-9_\u0400-\u04FF]|$)';
/** User: @DisplayName (supports Russian nicknames) */
const USER_MENTION_PATTERN = new RegExp(`@(${MENTION_CHAR_CLASS}{2,100})${MENTION_END}`, 'g');
/** Role: @&RoleName */
const ROLE_MENTION_PATTERN = new RegExp(`@&(${MENTION_CHAR_CLASS}{2,100})${MENTION_END}`, 'g');

/**
 * Extract raw mentions from content (no id resolution).
 * @everyone once; @token → user; @&token → role.
 */
export function extractMentions(content: string): ParsedMention[] {
  if (!content || typeof content !== 'string') return [];
  const result: ParsedMention[] = [];
  const seenUser = new Set<string>();
  const seenRole = new Set<string>();

  EVERYONE_PATTERN.lastIndex = 0;
  if (EVERYONE_PATTERN.test(content)) result.push({ type: 'everyone' });

  ROLE_MENTION_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ROLE_MENTION_PATTERN.exec(content)) !== null) {
    const raw = (m[1] ?? '').trim();
    if (!raw) continue;
    const key = `role:${raw.toLowerCase()}`;
    if (seenRole.has(key)) continue;
    seenRole.add(key);
    result.push({ type: 'role', raw });
  }

  USER_MENTION_PATTERN.lastIndex = 0;
  while ((m = USER_MENTION_PATTERN.exec(content)) !== null) {
    const raw = (m[1] ?? '').trim();
    if (!raw || raw.toLowerCase() === 'everyone') continue;
    const key = raw.toLowerCase();
    if (seenUser.has(key)) continue;
    seenUser.add(key);
    result.push({ type: 'user', raw });
  }
  return result;
}

export interface ResolveMentionsContext {
  serverId: string | null;
  channelId: string;
  authorId: string;
  /** Members on server (or DM: the other participant). id, name, nickname. */
  members: Array<{ id: string; name: string; nickname?: string | null }>;
  /** Roles on server (id, name). Empty for DM. */
  roles: Array<{ id: string; name: string }>;
  canMentionEveryone: boolean;
}

/**
 * Resolve parsed mentions to MessageMention[].
 * - everyone: include only if canMentionEveryone.
 * - user/raw: try member by nickname or name first; if not found and server, try role name. Dedupe by id.
 */
export function resolveMentions(
  parsed: ParsedMention[],
  ctx: ResolveMentionsContext
): MessageMention[] {
  const out: MessageMention[] = [];
  const addedUser = new Set<string>();
  const addedRole = new Set<string>();

  const memberByDisplay = new Map<string, { id: string; label: string }>();
  for (const m of ctx.members) {
    const nick = (m.nickname ?? m.name ?? '').trim().toLowerCase();
    const name = (m.name ?? '').trim().toLowerCase();
    const label = m.nickname?.trim() || m.name?.trim() || '';
    if (nick && !memberByDisplay.has(nick)) memberByDisplay.set(nick, { id: m.id, label });
    if (name && !memberByDisplay.has(name)) memberByDisplay.set(name, { id: m.id, label });
  }
  const roleByName = new Map<string, { id: string; label: string }>();
  for (const r of ctx.roles) {
    const n = (r.name ?? '').trim().toLowerCase();
    const label = (r.name ?? '').trim();
    if (n && !roleByName.has(n)) roleByName.set(n, { id: r.id, label });
  }

  for (const p of parsed) {
    if (p.type === 'everyone') {
      if (ctx.canMentionEveryone) out.push({ type: 'everyone', label: '@everyone' });
      continue;
    }
    const raw = p.raw.trim().toLowerCase();
    if (p.type === 'role') {
      if (ctx.serverId) {
        const roleEntry = roleByName.get(raw);
        if (roleEntry && !addedRole.has(roleEntry.id)) {
          addedRole.add(roleEntry.id);
          out.push({ type: 'role', id: roleEntry.id, label: roleEntry.label || undefined });
        }
      }
      continue;
    }
    const userEntry = memberByDisplay.get(raw);
    if (userEntry && !addedUser.has(userEntry.id)) {
      addedUser.add(userEntry.id);
      out.push({ type: 'user', id: userEntry.id, label: userEntry.label || undefined });
      continue;
    }
    if (ctx.serverId) {
      const roleEntry = roleByName.get(raw);
      if (roleEntry && !addedRole.has(roleEntry.id)) {
        addedRole.add(roleEntry.id);
        out.push({ type: 'role', id: roleEntry.id, label: roleEntry.label || undefined });
      }
    }
  }
  return out;
}
