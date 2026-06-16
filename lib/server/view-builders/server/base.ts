import { db, withDbRetry } from '@/lib/server/db/client';
import { servers } from '@/lib/server/db/schema';
import { eq } from 'drizzle-orm';

export async function buildServerBase(serverId: string) {
  const server = await withDbRetry(
    () =>
      db.query.servers.findFirst({
        where: eq(servers.id, serverId),
      }),
    'buildServerBase'
  );

  if (!server) {
    const err = new Error('Server not found');
    (err as Error & { status?: number }).status = 404;
    throw err;
  }

  return server;
}
