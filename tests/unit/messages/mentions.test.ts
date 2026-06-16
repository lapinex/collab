import { describe, it, expect } from '@jest/globals';
import { extractMentions, resolveMentions } from '@/lib/messages/mentions';

describe('extractMentions', () => {
  it('returns [] for empty, plain, or non-string input', () => {
    expect(extractMentions('')).toEqual([]);
    expect(extractMentions('just some text')).toEqual([]);
    expect(extractMentions(null as unknown as string)).toEqual([]);
  });

  it('parses a user mention', () => {
    expect(extractMentions('hi @john')).toEqual([{ type: 'user', raw: 'john' }]);
  });

  it('parses a role mention (@&name)', () => {
    expect(extractMentions('ping @&Admins')).toEqual([{ type: 'role', raw: 'Admins' }]);
  });

  it('parses @everyone', () => {
    expect(extractMentions('hello @everyone')).toEqual([{ type: 'everyone' }]);
  });

  it('ignores single-character mentions (minimum length is 2)', () => {
    expect(extractMentions('@a')).toEqual([]);
  });

  it('supports Cyrillic usernames', () => {
    expect(extractMentions('привет @Иван')).toEqual([{ type: 'user', raw: 'Иван' }]);
  });

  it('dedupes repeated user mentions case-insensitively', () => {
    expect(extractMentions('@John and @john')).toEqual([{ type: 'user', raw: 'John' }]);
  });

  it('orders results: everyone, then roles, then users', () => {
    expect(extractMentions('@john @&Mods @everyone')).toEqual([
      { type: 'everyone' },
      { type: 'role', raw: 'Mods' },
      { type: 'user', raw: 'john' },
    ]);
  });
});

describe('resolveMentions', () => {
  const baseCtx = {
    serverId: 's1' as string | null,
    channelId: 'c1',
    authorId: 'author',
    members: [{ id: 'u1', name: 'John', nickname: 'Johnny' as string | null }],
    roles: [{ id: 'r1', name: 'Mods' }],
    canMentionEveryone: true,
  };

  it('includes @everyone only when allowed', () => {
    expect(resolveMentions([{ type: 'everyone' }], baseCtx)).toEqual([
      { type: 'everyone', label: '@everyone' },
    ]);
    expect(
      resolveMentions([{ type: 'everyone' }], { ...baseCtx, canMentionEveryone: false })
    ).toEqual([]);
  });

  it('resolves a user by name (case-insensitive)', () => {
    expect(resolveMentions([{ type: 'user', raw: 'john' }], baseCtx)).toEqual([
      { type: 'user', id: 'u1', label: 'Johnny' },
    ]);
  });

  it('resolves a user by nickname', () => {
    expect(resolveMentions([{ type: 'user', raw: 'johnny' }], baseCtx)).toEqual([
      { type: 'user', id: 'u1', label: 'Johnny' },
    ]);
  });

  it('resolves a role by name on a server', () => {
    expect(resolveMentions([{ type: 'role', raw: 'mods' }], baseCtx)).toEqual([
      { type: 'role', id: 'r1', label: 'Mods' },
    ]);
  });

  it('does not resolve roles in a DM (serverId is null)', () => {
    expect(
      resolveMentions([{ type: 'role', raw: 'mods' }], { ...baseCtx, serverId: null })
    ).toEqual([]);
  });

  it('dedupes the same member matched via both name and nickname', () => {
    const result = resolveMentions(
      [
        { type: 'user', raw: 'john' },
        { type: 'user', raw: 'johnny' },
      ],
      baseCtx
    );
    expect(result).toEqual([{ type: 'user', id: 'u1', label: 'Johnny' }]);
  });
});
