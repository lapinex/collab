/**
 * Global (platform-level) user role for admin whitelist etc.
 * Does not depend on mvp-calculator or server permissions.
 */
import { db, withDbRetry } from '@/lib/server/db/client';
import { users } from '@/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { TTL } from '@/lib/server/redis/client';
import { redis } from '@/lib/server/redis/client';

export type GlobalRole = 'user' | 'moderator' | 'admin';

export async function getGlobalRole(userId: string): Promise<GlobalRole> {
  const cacheKey = `global_role:${userId}`;
  const cached = await redis.get<GlobalRole>(cacheKey);

  if (cached) {
    return cached;
  }

  const user = await withDbRetry(
    () =>
      db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: {
          globalRole: true,
        },
      }),
    'getGlobalRole'
  );

  const role = (user?.globalRole || 'user') as GlobalRole;
  await redis.setex(cacheKey, TTL.PERMISSIONS, role);

  return role;
}
