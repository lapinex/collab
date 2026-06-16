type WindowState = {
  count: number;
  resetAtMs: number;
};

// Simple in-memory fixed window limiter (per gateway instance).
// Phase 3 will replace/extend this with Redis TCP atomic counters if required.
const windows = new Map<string, WindowState>();

export function checkLocalRateLimit(options: {
  key: string;
  limit: number;
  windowSeconds: number;
}): { allowed: boolean; remaining: number; resetAtMs: number } {
  const { key, limit, windowSeconds } = options;
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  const existing = windows.get(key);
  if (!existing || existing.resetAtMs <= now) {
    const resetAtMs = now + windowMs;
    windows.set(key, { count: 1, resetAtMs });
    return { allowed: true, remaining: Math.max(0, limit - 1), resetAtMs };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAtMs: existing.resetAtMs };
  }

  existing.count += 1;
  return { allowed: true, remaining: Math.max(0, limit - existing.count), resetAtMs: existing.resetAtMs };
}

export function makeRateLimitKey(userId: string, action: string): string {
  return `${userId}:${action}`;
}

