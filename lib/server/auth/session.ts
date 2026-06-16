import { db } from '@/lib/server/db/client';
import { sessions } from '@/lib/server/db/schema';
import { eq, lt } from 'drizzle-orm';
import { redis, cacheKeys } from '@/lib/server/redis/client';
import { hashString } from '@/lib/utils';
import { generateId } from '@/lib/utils';

export interface CreateSessionParams {
  userId: string;
  tokenHash: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  expiresAt: Date;
}

export async function createSession(params: CreateSessionParams): Promise<string> {
  const sessionId = generateId();
  
  await db.insert(sessions).values({
    id: sessionId,
    userId: params.userId,
    tokenHash: params.tokenHash,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    expiresAt: params.expiresAt,
  });

  // Cache session
  await redis.setex(
    cacheKeys.session(sessionId),
    Math.floor((params.expiresAt.getTime() - Date.now()) / 1000),
    {
      userId: params.userId,
      tokenHash: params.tokenHash,
      expiresAt: params.expiresAt.toISOString(),
    }
  );

  return sessionId;
}

export async function getSession(sessionId: string): Promise<{
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
} | null> {
  // Try cache first
  const cached = await redis.get<{
    userId: string;
    tokenHash: string;
    expiresAt: string;
  }>(cacheKeys.session(sessionId));

  if (cached) {
    return {
      id: sessionId,
      userId: cached.userId,
      tokenHash: cached.tokenHash,
      expiresAt: new Date(cached.expiresAt),
    };
  }

  // Fallback to database
  const session = await db.query.sessions.findFirst({
    where: eq(sessions.id, sessionId),
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  // Cache it
  const ttl = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
  if (ttl > 0) {
    await redis.setex(
      cacheKeys.session(sessionId),
      ttl,
      {
        userId: session.userId,
        tokenHash: session.tokenHash,
        expiresAt: session.expiresAt.toISOString(),
      }
    );
  }

  return {
    id: session.id,
    userId: session.userId,
    tokenHash: session.tokenHash,
    expiresAt: session.expiresAt,
  };
}

export async function deleteSession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
  await redis.del(cacheKeys.session(sessionId));
}

export async function deleteAllUserSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
  
  // Note: We can't easily delete all cached sessions without scanning
  // In production, consider using a session set in Redis
}

export async function deleteExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

export function hashToken(token: string): string {
  return hashString(token);
}
