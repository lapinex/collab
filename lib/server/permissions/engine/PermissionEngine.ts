/**
 * Permission Engine — single entry point for all permission checks.
 * Uses lib/permissions/calculator.ts and Redis cache internally; do not import calculator elsewhere.
 */

import {
  calculatePermissions,
  checkPermission,
  requirePermission as calculatorRequirePermission,
  invalidatePermissionsCache as calculatorInvalidateCache,
  invalidatePermissionsCacheForServer as calculatorInvalidateForServer,
} from '../calculator';
import { invalidatePermissionCacheByChannel as invalidatePermissionCacheByChannelUtil } from '../invalidatePermissionCache';
import { flagsFromFinal } from '../constants';
import { Permission } from '@/types/permissions';
import type { PermissionFlags } from '@/types/permissions';

// ---------------------------------------------------------------------------
// PermissionFlag — single enum for all permission checks (API surface)
// ---------------------------------------------------------------------------

export enum PermissionFlag {
  // Implemented (stable)
  ViewChannel = 'ViewChannel',
  SendMessages = 'SendMessages',
  AddReactions = 'AddReactions',
  ReadMessageHistory = 'ReadMessageHistory',
  Connect = 'Connect',
  Speak = 'Speak',

  // BETA — enforced via calculator but may change
  ViewServer = 'ViewServer',
  ManageRoles = 'ManageRoles',
  ManageChannels = 'ManageChannels',
  ManageServer = 'ManageServer',
  KickMembers = 'KickMembers',
  BanMembers = 'BanMembers',
  CreateInvites = 'CreateInvites',
  ManageInvites = 'ManageInvites',
  ViewAuditLog = 'ViewAuditLog',
  ManageMessages = 'ManageMessages',
  ManageMembers = 'ManageMembers',
  ManageWebhooks = 'ManageWebhooks',
  MentionEveryone = 'MentionEveryone',
  AttachFiles = 'AttachFiles',
  MuteMembers = 'MuteMembers',
  DeafenMembers = 'DeafenMembers',
}

/** Map PermissionFlag -> Permission bit. Unmapped flags have no implementation and can() returns false. */
const FLAG_TO_PERMISSION: Partial<Record<PermissionFlag, Permission>> = {
  [PermissionFlag.ViewChannel]: Permission.VIEW_CHANNEL,
  [PermissionFlag.SendMessages]: Permission.SEND_MESSAGES,
  [PermissionFlag.AddReactions]: Permission.ADD_REACTIONS,
  [PermissionFlag.ReadMessageHistory]: Permission.READ_MESSAGE_HISTORY,
  [PermissionFlag.Connect]: Permission.CONNECT,
  [PermissionFlag.Speak]: Permission.SPEAK,
  [PermissionFlag.ViewServer]: Permission.VIEW_SERVER,
  [PermissionFlag.ManageRoles]: Permission.MANAGE_ROLES,
  [PermissionFlag.ManageChannels]: Permission.MANAGE_CHANNELS,
  [PermissionFlag.ManageServer]: Permission.MANAGE_SERVER,
  [PermissionFlag.KickMembers]: Permission.KICK_MEMBERS,
  [PermissionFlag.BanMembers]: Permission.BAN_MEMBERS,
  [PermissionFlag.CreateInvites]: Permission.CREATE_INVITES,
  [PermissionFlag.ManageInvites]: Permission.MANAGE_INVITES,
  [PermissionFlag.ViewAuditLog]: Permission.VIEW_AUDIT_LOG,
  [PermissionFlag.ManageMessages]: Permission.MANAGE_MESSAGES,
  [PermissionFlag.ManageMembers]: Permission.MANAGE_MEMBERS,
  [PermissionFlag.ManageWebhooks]: Permission.MANAGE_WEBHOOKS,
  [PermissionFlag.MentionEveryone]: Permission.MENTION_EVERYONE,
  [PermissionFlag.AttachFiles]: Permission.ATTACH_FILES,
  [PermissionFlag.MuteMembers]: Permission.MUTE_MEMBERS,
  [PermissionFlag.DeafenMembers]: Permission.DEAFEN_MEMBERS,
};

export interface Permissions {
  allow: number;
  deny: number;
  final: number;
  flags: PermissionFlags;
}

/** Default base permission flags for a new Text Channel (implemented only). */
export const DEFAULT_BASE_PERMISSIONS_TEXT_CHANNEL: PermissionFlag[] = [
  PermissionFlag.ViewChannel,
  PermissionFlag.SendMessages,
  PermissionFlag.AddReactions,
  PermissionFlag.ReadMessageHistory,
];

/** Default base permission flags for a new Voice Channel (implemented only). */
export const DEFAULT_BASE_PERMISSIONS_VOICE_CHANNEL: PermissionFlag[] = [
  PermissionFlag.ViewChannel,
  PermissionFlag.Connect,
  PermissionFlag.Speak,
];

// ---------------------------------------------------------------------------
// Singleton engine
// ---------------------------------------------------------------------------

class PermissionEngineImpl {
  async getChannelPermissions(
    userId: string,
    serverId: string,
    channelId: string
  ): Promise<Permissions> {
    const calculated = await calculatePermissions(userId, serverId, channelId);
    return {
      ...calculated,
      flags: flagsFromFinal(calculated.final) as PermissionFlags,
    };
  }

  async getServerPermissions(userId: string, serverId: string): Promise<Permissions> {
    const calculated = await calculatePermissions(userId, serverId);
    return {
      ...calculated,
      flags: flagsFromFinal(calculated.final) as PermissionFlags,
    };
  }

  async can(
    userId: string,
    serverId: string,
    channelId: string | undefined,
    permission: PermissionFlag
  ): Promise<boolean> {
    const bit = FLAG_TO_PERMISSION[permission];
    if (bit === undefined) {
      return false;
    }
    return checkPermission(userId, serverId, bit, channelId);
  }

  async require(
    userId: string,
    serverId: string,
    channelId: string | undefined,
    permission: PermissionFlag
  ): Promise<void> {
    const ok = await this.can(userId, serverId, channelId, permission);
    if (!ok) {
      throw new Error('Insufficient permissions');
    }
  }

  async invalidatePermissionsCache(userId: string, serverId: string): Promise<void> {
    return calculatorInvalidateCache(userId, serverId);
  }

  async invalidatePermissionsCacheForServer(serverId: string): Promise<void> {
    return calculatorInvalidateForServer(serverId);
  }

  /** Invalidate permission cache for a single channel (e.g. after overwrite change). */
  async invalidatePermissionCacheByChannel(serverId: string, channelId: string): Promise<void> {
    return invalidatePermissionCacheByChannelUtil(serverId, channelId);
  }

  /** Backward compat: require by Permission bit (e.g. for middleware). */
  async requireByBit(
    userId: string,
    serverId: string,
    permission: Permission,
    channelId?: string
  ): Promise<void> {
    return calculatorRequirePermission(userId, serverId, permission, channelId);
  }

  /** Backward compat: check by Permission bit. */
  async canByBit(
    userId: string,
    serverId: string,
    permission: Permission,
    channelId?: string
  ): Promise<boolean> {
    return checkPermission(userId, serverId, permission, channelId);
  }
}

export const PermissionEngine = new PermissionEngineImpl();
