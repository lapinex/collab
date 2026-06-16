import { describe, it, expect } from '@jest/globals';
import { Permission } from '@/types/permissions';
import { hasPermission } from '@/lib/permissions/constants';
import {
  calculateChannelPermissions,
  convertToOverwrite,
  type ChannelPermissionOverwrite,
} from '@/lib/server/permissions/calculateChannelPermissions';
import type { ChannelPermission } from '@/types/server';

const EVERYONE = 'everyone-role';

const ow = (over: Partial<ChannelPermissionOverwrite>): ChannelPermissionOverwrite => ({
  id: 'ow',
  channelId: 'c1',
  roleId: null,
  userId: null,
  allow: 0,
  deny: 0,
  ...over,
});

describe('calculateChannelPermissions', () => {
  it('returns base permissions with no overwrites', () => {
    expect(
      calculateChannelPermissions({
        memberRoles: [],
        baseRolePermissions: Permission.VIEW_CHANNEL,
        channelOverwrites: [],
        userId: 'u1',
      })
    ).toBe(Permission.VIEW_CHANNEL);
  });

  it('short-circuits when base grants ADMINISTRATOR', () => {
    expect(
      calculateChannelPermissions({
        memberRoles: [],
        baseRolePermissions: Permission.ADMINISTRATOR,
        channelOverwrites: [ow({ roleId: EVERYONE, deny: Permission.VIEW_CHANNEL })],
        userId: 'u1',
        everyoneRoleId: EVERYONE,
      })
    ).toBe(Permission.ADMINISTRATOR);
  });

  it('applies an @everyone deny', () => {
    const final = calculateChannelPermissions({
      memberRoles: [],
      baseRolePermissions: Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES,
      channelOverwrites: [ow({ roleId: EVERYONE, deny: Permission.SEND_MESSAGES })],
      userId: 'u1',
      everyoneRoleId: EVERYONE,
    });
    expect(hasPermission(final, Permission.SEND_MESSAGES)).toBe(false);
    expect(hasPermission(final, Permission.VIEW_CHANNEL)).toBe(true);
  });

  it('lets a user overwrite beat an @everyone deny', () => {
    const final = calculateChannelPermissions({
      memberRoles: [],
      baseRolePermissions: Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES,
      channelOverwrites: [
        ow({ roleId: EVERYONE, deny: Permission.SEND_MESSAGES }),
        ow({ userId: 'u1', allow: Permission.SEND_MESSAGES }),
      ],
      userId: 'u1',
      everyoneRoleId: EVERYONE,
    });
    expect(hasPermission(final, Permission.SEND_MESSAGES)).toBe(true);
  });

  describe('convertToOverwrite', () => {
    it('converts bigint allow/deny to numbers and preserves ids', () => {
      const cp = {
        id: 'cp1',
        channelId: 'c1',
        roleId: 'r1',
        userId: null,
        allowPermissions: 5n,
        denyPermissions: 3n,
      } as unknown as ChannelPermission;
      const result = convertToOverwrite(cp);
      expect(result.allow).toBe(5);
      expect(result.deny).toBe(3);
      expect(typeof result.allow).toBe('number');
      expect(result.roleId).toBe('r1');
      expect(result.userId).toBeNull();
    });

    it('passes numeric allow/deny through unchanged', () => {
      const cp = {
        id: 'cp2',
        channelId: 'c1',
        roleId: null,
        userId: 'u9',
        allowPermissions: 7,
        denyPermissions: 0,
      } as unknown as ChannelPermission;
      const result = convertToOverwrite(cp);
      expect(result.allow).toBe(7);
      expect(result.deny).toBe(0);
      expect(result.userId).toBe('u9');
    });
  });
});
