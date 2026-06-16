/**
 * Versioned permission cache. Key includes :v${version}.
 * Invalidate = INCR server:permVersion:${serverId} (no mass delete).
 */
import { getRedis } from '@/lib/server/redis/client';
import { cacheKeys } from '@/lib/server/redis/client';

export async function getPermVersion(serverId: string): Promise<number> {
  const r = getRedis();
  const key = cacheKeys.permVersion(serverId);
  const raw = await r.get(key);
  if (raw != null) {
    const v = parseInt(String(raw), 10);
    return Number.isNaN(v) ? 1 : Math.max(1, v);
  }
  await r.set(key, '1');
  return 1;
}

export async function incrPermVersion(serverId: string): Promise<number> {
  const r = getRedis();
  const key = cacheKeys.permVersion(serverId);
  const v = await r.incr(key);
  return v;
}
