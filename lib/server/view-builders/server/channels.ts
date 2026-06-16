import { db, withDbRetry } from '@/lib/server/db/client';
import { channels } from '@/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { cacheKeys, redisDel } from '@/lib/server/redis/client';

/** Invalidate server channels list cache (call when channel created/updated/deleted). */
export async function invalidateServerChannelsCache(serverId: string): Promise<void> {
  try {
    await redisDel(cacheKeys.serverChannels(serverId));
  } catch (err) {
    console.warn('[invalidateServerChannelsCache]', err);
  }
}

export async function buildChannelsPart(serverId: string) {
  return withDbRetry(
    () =>
      db.query.channels.findMany({
        where: eq(channels.serverId, serverId),
        orderBy: (ch, { asc }) => [asc(ch.position), asc(ch.createdAt)],
      }),
    'buildChannelsPart'
  );
}
