import { db, withDbRetry } from '@/lib/server/db/client';
import { serverEmojis, serverStickers } from '@/lib/server/db/schema';
import { eq } from 'drizzle-orm';

export async function buildAssetsPart(serverId: string) {
  const [emojis, stickers] = await Promise.all([
    withDbRetry(
      () =>
        db.query.serverEmojis.findMany({
          where: eq(serverEmojis.serverId, serverId),
          orderBy: (emojis, { asc }) => [asc(emojis.name)],
        }),
      'buildAssetsPart (emojis)'
    ),
    withDbRetry(
      () =>
        db.query.serverStickers.findMany({
          where: eq(serverStickers.serverId, serverId),
          orderBy: (stickers, { asc }) => [asc(stickers.name)],
        }),
      'buildAssetsPart (stickers)'
    ),
  ]);

  return { emojis, stickers };
}
