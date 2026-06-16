/**
 * User Settings Service — get/update account settings with Redis cache.
 * Used for DM enforcement, block checks, voice settings.
 */
import 'server-only';
import { db, withDbRetry } from '@/lib/server/db/client';
import { userSettings, userBlocks } from '@/lib/server/db/schema';
import { eq, and, or } from 'drizzle-orm';
import { cacheKeys, TTL, redisGetJSON, redisSetJSON, redisDel } from '@/lib/server/redis/client';

export interface AccountSettingsRow {
  allowDm: boolean;
  allowDmFromNonMutual: boolean;
  allowFriendRequests: boolean;
  notificationsMode: 'all' | 'mentions' | 'none';
  voiceInputDevice: string | null;
  voiceOutputDevice: string | null;
  voiceScreenShareSound: boolean;
}

const defaults: AccountSettingsRow = {
  allowDm: true,
  allowDmFromNonMutual: false,
  allowFriendRequests: true,
  notificationsMode: 'all',
  voiceInputDevice: null,
  voiceOutputDevice: null,
  voiceScreenShareSound: true,
};

export async function getUserSettings(userId: string): Promise<AccountSettingsRow> {
  const cached = await redisGetJSON<AccountSettingsRow>(cacheKeys.userSettings(userId));
  if (cached) return { ...defaults, ...cached };

  const row = await withDbRetry(
    () => db.query.userSettings.findFirst({
      where: eq(userSettings.userId, userId),
      columns: {
        allowDm: true,
        allowDmFromNonMutual: true,
        allowFriendRequests: true,
        notificationsMode: true,
        voiceInputDevice: true,
        voiceOutputDevice: true,
        voiceScreenShareSound: true,
      },
    }),
    'getUserSettings'
  );

  const result: AccountSettingsRow = {
    allowDm: row?.allowDm ?? defaults.allowDm,
    allowDmFromNonMutual: row?.allowDmFromNonMutual ?? defaults.allowDmFromNonMutual,
    allowFriendRequests: row?.allowFriendRequests ?? defaults.allowFriendRequests,
    notificationsMode: (row?.notificationsMode as AccountSettingsRow['notificationsMode']) ?? defaults.notificationsMode,
    voiceInputDevice: row?.voiceInputDevice ?? null,
    voiceOutputDevice: row?.voiceOutputDevice ?? null,
    voiceScreenShareSound: row?.voiceScreenShareSound ?? defaults.voiceScreenShareSound,
  };

  await redisSetJSON(cacheKeys.userSettings(userId), result, TTL.USER_SETTINGS);
  return result;
}

export async function invalidateUserSettingsCache(userId: string): Promise<void> {
  await redisDel(cacheKeys.userSettings(userId));
}

/** Check if two users share at least one server (for DM allow_dm_from_non_mutual). */
export async function usersShareServer(userId1: string, userId2: string): Promise<boolean> {
  const { userRoles, servers } = await import('@/lib/server/db/schema');

  // Get server IDs for user1: owned + member
  const servers1 = await withDbRetry(
    async () => {
      const owned = await db.select({ serverId: servers.id }).from(servers).where(eq(servers.ownerId, userId1));
      const member = await db.select({ serverId: userRoles.serverId }).from(userRoles).where(eq(userRoles.userId, userId1));
      return new Set([...owned.map((r) => r.serverId), ...member.map((r) => r.serverId)]);
    },
    'usersShareServer-1'
  );
  if (servers1.size === 0) return false;

  // Get server IDs for user2
  const servers2 = await withDbRetry(
    async () => {
      const owned = await db.select({ serverId: servers.id }).from(servers).where(eq(servers.ownerId, userId2));
      const member = await db.select({ serverId: userRoles.serverId }).from(userRoles).where(eq(userRoles.userId, userId2));
      return new Set([...owned.map((r) => r.serverId), ...member.map((r) => r.serverId)]);
    },
    'usersShareServer-2'
  );

  for (const s of servers1) {
    if (servers2.has(s)) return true;
  }
  return false;
}

/** Check if userId has blocked blockedUserId or vice versa (either direction blocks DM). */
export async function isBlocked(actorId: string, targetId: string): Promise<boolean> {
  const block = await withDbRetry(
    () => db.query.userBlocks.findFirst({
      where: or(
        and(eq(userBlocks.userId, actorId), eq(userBlocks.blockedUserId, targetId)),
        and(eq(userBlocks.userId, targetId), eq(userBlocks.blockedUserId, actorId))
      ),
    }),
    'isBlocked'
  );
  return !!block;
}
