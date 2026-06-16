/**
 * Redis badge counters (unread / mentions). Race-safe: only INCR, HINCRBY, SET 0, HDEL.
 * Server badge = HASH channelId -> count; badge total = HGETALL + SUM (O(channels with activity)).
 */
import 'server-only';
import { db, withDbRetry } from '@/lib/server/db/client';
import { userRoles, dmChannels } from '@/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import {
  cacheKeys,
  redisIncr,
  redisHincrby,
} from '@/lib/server/redis/client';

export interface BadgeMessageContext {
  channelId: string;
  serverId?: string;
  dmId?: string;
  authorId: string;
}

/**
 * Get all userId that should receive unread for this message: server = all members, DM = other user.
 */
async function getAllRecipients(ctx: BadgeMessageContext): Promise<Set<string>> {
  const out = new Set<string>();
  if (ctx.dmId) {
    const dm = await withDbRetry(
      () =>
        db.query.dmChannels.findFirst({
          where: eq(dmChannels.id, ctx.channelId),
          columns: { user1Id: true, user2Id: true },
        }),
      'badges dm recipients'
    );
    if (dm) {
      const other = dm.user1Id === ctx.authorId ? dm.user2Id : dm.user1Id;
      if (other) out.add(other);
    }
    return out;
  }
  if (ctx.serverId) {
    const rows = await withDbRetry(
      () =>
        db.select({ userId: userRoles.userId }).from(userRoles).where(eq(userRoles.serverId, ctx.serverId!)),
      'badges server recipients'
    );
    rows.forEach((r) => out.add(r.userId));
  }
  return out;
}

/**
 * Increment Redis badge counters for a new message. Call after notifications are created.
 * For each recipient (except author): INCR unread. For each mention recipient: INCR mentions.
 * No viewing logic; client calls mark-channel-read when opening the channel.
 */
export async function incrementBadgesForNewMessage(
  ctx: BadgeMessageContext,
  mentionUserIds: string[]
): Promise<void> {
  const allRecipients = await getAllRecipients(ctx);
  const { channelId, serverId, dmId, authorId } = ctx;

  if (dmId) {
    for (const userId of allRecipients) {
      if (userId === authorId) continue;
      await redisIncr(cacheKeys.unreadDm(channelId, userId));
    }
    return;
  }

  if (!serverId) return;

  const mentionSet = new Set(mentionUserIds);
  for (const userId of allRecipients) {
    if (userId === authorId) continue;
    await redisIncr(cacheKeys.unreadChannel(channelId, userId));
    await redisHincrby(cacheKeys.unreadServer(serverId, userId), channelId, 1);
    if (mentionSet.has(userId)) {
      await redisIncr(cacheKeys.mentionsChannel(channelId, userId));
      await redisHincrby(cacheKeys.mentionsServer(serverId, userId), channelId, 1);
    }
  }
}
