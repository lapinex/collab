import { redis } from '@/lib/server/redis/client';

export interface RateLimitOptions {
  key: string;
  limit: number;
  window: number; // in seconds
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset: number;
}

export async function checkRateLimit(
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const { key, limit, window } = options;
  const redisKey = `rate_limit:${key}`;

  try {
    // Get current count
    const current = await redis.get<number>(redisKey);

    if (current === null) {
      // First request, set count to 1 with expiration
      await redis.setex(redisKey, window, 1);
      return {
        allowed: true,
        remaining: limit - 1,
        reset: Date.now() + window * 1000,
      };
    }

    if (current >= limit) {
      // Rate limit exceeded
      const ttl = await redis.ttl(redisKey);
      return {
        allowed: false,
        remaining: 0,
        reset: Date.now() + (ttl > 0 ? ttl : window) * 1000,
      };
    }

    // Increment count
    await redis.incr(redisKey);
    const newCount = current + 1;

    return {
      allowed: true,
      remaining: limit - newCount,
      reset: Date.now() + window * 1000,
    };
  } catch (error) {
    console.error('Rate limit error:', error);
    // On error, allow the request (fail open)
    return {
      allowed: true,
      remaining: limit,
      reset: Date.now() + window * 1000,
    };
  }
}

export function getRateLimitKey(
  identifier: string,
  endpoint: string
): string {
  return `${identifier}:${endpoint}`;
}

// Predefined rate limits
export const RATE_LIMITS = {
  AUTH: {
    limit: 5,
    window: 60, // 5 requests per minute
  },
  MESSAGES: {
    limit: 30,
    window: 60, // 30 messages per minute
  },
  API: {
    limit: 100,
    window: 60, // 100 requests per minute
  },
  UPLOAD: {
    limit: 10,
    window: 60, // 10 uploads per minute
  },
} as const;
