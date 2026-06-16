import { NextRequest } from 'next/server';
import { redis } from '@/lib/server/redis/client';
import { getClientIp } from '@/lib/server/utils/request-ip';

export function getClientIP(request: NextRequest): string {
  return getClientIp(request);
}

export async function isIPBlocked(ip: string): Promise<boolean> {
  const key = `ip_blocked:${ip}`;
  const blocked = await redis.get<boolean>(key);
  return blocked === true;
}

export async function blockIP(ip: string, duration: number = 3600): Promise<void> {
  const key = `ip_blocked:${ip}`;
  await redis.setex(key, duration, true);
}

export async function unblockIP(ip: string): Promise<void> {
  const key = `ip_blocked:${ip}`;
  await redis.del(key);
}

export async function recordFailedAttempt(ip: string): Promise<number> {
  const key = `failed_attempts:${ip}`;
  const count = await redis.incr(key);
  await redis.expire(key, 3600); // Expire after 1 hour
  return count;
}

export async function resetFailedAttempts(ip: string): Promise<void> {
  const key = `failed_attempts:${ip}`;
  await redis.del(key);
}

export async function checkIPProtection(
  request: NextRequest,
  maxFailedAttempts: number = 5
): Promise<{ allowed: boolean; reason?: string }> {
  const ip = getClientIP(request);

  // Check if IP is blocked
  const blocked = await isIPBlocked(ip);
  if (blocked) {
    return { allowed: false, reason: 'IP is blocked' };
  }

  // Check failed attempts
  const failedAttempts = await redis.get<number>(`failed_attempts:${ip}`) || 0;
  if (failedAttempts >= maxFailedAttempts) {
    // Auto-block IP
    await blockIP(ip, 3600); // Block for 1 hour
    return { allowed: false, reason: 'Too many failed attempts' };
  }

  return { allowed: true };
}
