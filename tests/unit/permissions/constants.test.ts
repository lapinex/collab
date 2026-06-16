import { describe, it, expect } from '@jest/globals';
import { Permission } from '@/types/permissions';
import {
  hasPermission,
  combinePermissions,
  flagsFromFinal,
  BASE_PERMISSIONS,
  PERMISSIONS,
} from '@/lib/permissions/constants';

describe('permissions/constants', () => {
  describe('hasPermission', () => {
    it('returns true when the exact bit is present', () => {
      expect(hasPermission(Permission.SEND_MESSAGES, Permission.SEND_MESSAGES)).toBe(true);
    });

    it('returns false when the bit is absent', () => {
      expect(hasPermission(Permission.SEND_MESSAGES, Permission.VIEW_CHANNEL)).toBe(false);
      expect(hasPermission(0, Permission.SEND_MESSAGES)).toBe(false);
    });

    it('matches a single permission inside a combined set', () => {
      const set = combinePermissions(Permission.VIEW_CHANNEL, Permission.SEND_MESSAGES);
      expect(hasPermission(set, Permission.VIEW_CHANNEL)).toBe(true);
      expect(hasPermission(set, Permission.SEND_MESSAGES)).toBe(true);
      expect(hasPermission(set, Permission.BAN_MEMBERS)).toBe(false);
    });

    it('ADMINISTRATOR grants every permission', () => {
      expect(hasPermission(Permission.ADMINISTRATOR, Permission.BAN_MEMBERS)).toBe(true);
      expect(hasPermission(Permission.ADMINISTRATOR, Permission.VIEW_CHANNEL)).toBe(true);
    });

    it('ADMINISTRATOR aliases MANAGE_MEMBERS (documented 32-bit overflow: 1 << 36 wraps to 1 << 4)', () => {
      expect(Permission.ADMINISTRATOR).toBe(Permission.MANAGE_MEMBERS);
    });
  });

  describe('combinePermissions', () => {
    it('returns 0 for no arguments', () => {
      expect(combinePermissions()).toBe(0);
    });

    it('ORs the bits together', () => {
      expect(combinePermissions(Permission.VIEW_CHANNEL, Permission.SEND_MESSAGES)).toBe(
        Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES
      );
    });

    it('is idempotent for duplicate flags', () => {
      expect(combinePermissions(Permission.VIEW_CHANNEL, Permission.VIEW_CHANNEL)).toBe(
        Permission.VIEW_CHANNEL
      );
    });
  });

  describe('flagsFromFinal', () => {
    it('reports every flag false for empty permissions', () => {
      const flags = flagsFromFinal(0);
      expect(flags.canSendMessages).toBe(false);
      expect(flags.canViewChannel).toBe(false);
      expect(flags.canManageRoles).toBe(false);
      expect(Object.values(flags).every((v) => v === false)).toBe(true);
    });

    it('maps matching bits to true and others to false', () => {
      const flags = flagsFromFinal(
        combinePermissions(Permission.VIEW_CHANNEL, Permission.SEND_MESSAGES)
      );
      expect(flags.canViewChannel).toBe(true);
      expect(flags.canSendMessages).toBe(true);
      expect(flags.canBanMembers).toBe(false);
    });

    it('turns every flag true under ADMINISTRATOR', () => {
      const flags = flagsFromFinal(Permission.ADMINISTRATOR);
      expect(Object.values(flags).every((v) => v === true)).toBe(true);
    });
  });

  describe('BASE_PERMISSIONS / PERMISSIONS', () => {
    it('base permissions include the core view/send bits', () => {
      expect(BASE_PERMISSIONS).toContain(Permission.VIEW_SERVER);
      expect(BASE_PERMISSIONS).toContain(Permission.VIEW_CHANNEL);
      expect(BASE_PERMISSIONS).toContain(Permission.SEND_MESSAGES);
    });

    it('PERMISSIONS map mirrors the enum values', () => {
      expect(PERMISSIONS.SEND_MESSAGES).toBe(Permission.SEND_MESSAGES);
      expect(PERMISSIONS.MANAGE_ROLES).toBe(Permission.MANAGE_ROLES);
    });
  });
});
