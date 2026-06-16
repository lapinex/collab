import { describe, it, expect } from '@jest/globals';
import { Permission } from '@/types/permissions';
import { hasPermission } from '@/lib/permissions/constants';
import { calculateFinalPermissions } from '@/lib/server/permissions/calculateFinalPermissions';
import type { ChannelPermissionOverwrite } from '@/lib/server/permissions/calculateChannelPermissions';
import type { Role } from '@/types/server';

const EVERYONE = 'everyone-role';

const makeRole = (id: string, position: number): Role => ({
  id,
  serverId: 's1',
  name: id,
  color: '#ffffff',
  position,
  permissions: 0n,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const ow = (over: Partial<ChannelPermissionOverwrite>): ChannelPermissionOverwrite => ({
  id: 'ow',
  channelId: 'c1',
  roleId: null,
  userId: null,
  allow: 0,
  deny: 0,
  ...over,
});

const base = (...perms: Permission[]): number => perms.reduce((acc, p) => acc | p, 0);

describe('calculateFinalPermissions', () => {
  it('returns base permissions when there are no overwrites', () => {
    const final = calculateFinalPermissions({
      memberRoles: [],
      baseRolePermissions: base(Permission.VIEW_CHANNEL, Permission.SEND_MESSAGES),
      categoryOverwrites: [],
      channelOverwrites: [],
      userId: 'u1',
    });
    expect(final).toBe(base(Permission.VIEW_CHANNEL, Permission.SEND_MESSAGES));
  });

  it('short-circuits to ADMINISTRATOR when base grants it', () => {
    const final = calculateFinalPermissions({
      memberRoles: [],
      baseRolePermissions: Permission.ADMINISTRATOR,
      categoryOverwrites: [],
      channelOverwrites: [ow({ roleId: EVERYONE, deny: Permission.SEND_MESSAGES })],
      userId: 'u1',
      everyoneRoleId: EVERYONE,
    });
    expect(final).toBe(Permission.ADMINISTRATOR);
  });

  it('applies an @everyone deny (removes a permission)', () => {
    const final = calculateFinalPermissions({
      memberRoles: [],
      baseRolePermissions: base(Permission.VIEW_CHANNEL, Permission.SEND_MESSAGES),
      categoryOverwrites: [],
      channelOverwrites: [ow({ roleId: EVERYONE, deny: Permission.SEND_MESSAGES })],
      userId: 'u1',
      everyoneRoleId: EVERYONE,
    });
    expect(hasPermission(final, Permission.SEND_MESSAGES)).toBe(false);
    expect(hasPermission(final, Permission.VIEW_CHANNEL)).toBe(true);
  });

  it('applies an @everyone allow (adds a permission)', () => {
    const final = calculateFinalPermissions({
      memberRoles: [],
      baseRolePermissions: Permission.VIEW_CHANNEL,
      categoryOverwrites: [],
      channelOverwrites: [ow({ roleId: EVERYONE, allow: Permission.SEND_MESSAGES })],
      userId: 'u1',
      everyoneRoleId: EVERYONE,
    });
    expect(hasPermission(final, Permission.SEND_MESSAGES)).toBe(true);
  });

  it('lets a role overwrite override an @everyone deny', () => {
    const final = calculateFinalPermissions({
      memberRoles: [makeRole('r1', 5)],
      baseRolePermissions: Permission.VIEW_CHANNEL,
      categoryOverwrites: [],
      channelOverwrites: [
        ow({ roleId: EVERYONE, deny: Permission.SEND_MESSAGES }),
        ow({ roleId: 'r1', allow: Permission.SEND_MESSAGES }),
      ],
      userId: 'u1',
      everyoneRoleId: EVERYONE,
    });
    expect(hasPermission(final, Permission.SEND_MESSAGES)).toBe(true);
  });

  it('gives the user-specific overwrite the highest priority', () => {
    const final = calculateFinalPermissions({
      memberRoles: [],
      baseRolePermissions: base(Permission.VIEW_CHANNEL, Permission.SEND_MESSAGES),
      categoryOverwrites: [],
      channelOverwrites: [
        ow({ roleId: EVERYONE, deny: Permission.SEND_MESSAGES }),
        ow({ userId: 'u1', allow: Permission.SEND_MESSAGES }),
      ],
      userId: 'u1',
      everyoneRoleId: EVERYONE,
    });
    expect(hasPermission(final, Permission.SEND_MESSAGES)).toBe(true);
  });

  it('lets a channel overwrite override a category overwrite', () => {
    const final = calculateFinalPermissions({
      memberRoles: [],
      baseRolePermissions: base(Permission.VIEW_CHANNEL, Permission.SEND_MESSAGES),
      categoryOverwrites: [ow({ roleId: EVERYONE, deny: Permission.SEND_MESSAGES })],
      channelOverwrites: [ow({ roleId: EVERYONE, allow: Permission.SEND_MESSAGES })],
      userId: 'u1',
      everyoneRoleId: EVERYONE,
    });
    expect(hasPermission(final, Permission.SEND_MESSAGES)).toBe(true);
  });

  it('ignores overwrites for roles the member does not have', () => {
    const final = calculateFinalPermissions({
      memberRoles: [makeRole('r1', 1)],
      baseRolePermissions: Permission.VIEW_CHANNEL,
      categoryOverwrites: [],
      channelOverwrites: [ow({ roleId: 'role-not-owned', allow: Permission.BAN_MEMBERS })],
      userId: 'u1',
      everyoneRoleId: EVERYONE,
    });
    expect(hasPermission(final, Permission.BAN_MEMBERS)).toBe(false);
    expect(final).toBe(Permission.VIEW_CHANNEL);
  });
});
