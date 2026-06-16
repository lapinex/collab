/**
 * Presence sweeper: remove stale userIds from presence:server:${serverId} sets.
 * User keys presence:user:${userId} have TTL 60s; when absent, user is offline.
 * Run every 2 minutes; only one instance runs cluster-wide (Redis lock).
 */
import 'server-only';
import { getRedis } from '@/lib/server/redis/client';
import { cacheKeys } from '@/lib/server/redis/client';

const SWEEP_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const PRESENCE_SWEEPER_LOCK_TTL = 120; // seconds
const PRESENCE_SERVER_PREFIX = 'presence:server:';

async function tryAcquireSweeperLock(): Promise<boolean> {
  const r = getRedis();
  const result = await r.set(cacheKeys.presenceSweeperLock(), '1', { nx: true, ex: PRESENCE_SWEEPER_LOCK_TTL });
  return result != null;
}

export async function runPresenceSweep(): Promise<void> {
  try {
    const r = getRedis();
    const serverKeys = (await r.keys(`${PRESENCE_SERVER_PREFIX}*`)) as string[];
    for (const serverKey of serverKeys) {
      const userIds = (await r.smembers(serverKey)) as string[];
      for (const userId of userIds) {
        const userKey = cacheKeys.presenceUser(userId);
        const exists = await r.get(userKey);
        if (exists == null) {
          await r.srem(serverKey, userId);
        }
      }
    }
  } catch (err) {
    console.warn('[presence/sweeper] runPresenceSweep error:', err);
  }
}

async function runSweepIfLocked(): Promise<void> {
  if (!(await tryAcquireSweeperLock())) return;
  await runPresenceSweep();
}

let sweepInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the presence sweeper (every 2 minutes). Safe to call multiple times.
 * Only one instance runs the sweep cluster-wide (Vercel/serverless safe).
 */
export function startPresenceSweeper(): void {
  if (sweepInterval != null) return;
  runSweepIfLocked().catch(() => {});
  sweepInterval = setInterval(() => {
    runSweepIfLocked().catch(() => {});
  }, SWEEP_INTERVAL_MS);
}

/**
 * Stop the presence sweeper (e.g. in tests).
 */
export function stopPresenceSweeper(): void {
  if (sweepInterval != null) {
    clearInterval(sweepInterval);
    sweepInterval = null;
  }
}
