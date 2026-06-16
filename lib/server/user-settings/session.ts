/**
 * User Sessions — device tracking for settings "Devices" section.
 * Creates/updates user_session on request, identifies current device via cookie.
 */
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { db, withDbRetry } from '@/lib/server/db/client';
import { userSessions } from '@/lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { getClientIp } from '@/lib/server/utils/request-ip';
import { generateId } from '@/lib/utils';

const SESSION_COOKIE = 'collab-session-id';
const SESSION_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export async function ensureUserSession(
  request: NextRequest,
  userId: string
): Promise<{ sessionId: string; isNew: boolean }> {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  const userAgent = request.headers.get('user-agent') || null;
  const ip = getClientIp(request);
  const now = new Date();

  if (sessionId) {
    const existing = await withDbRetry(
      () => db.query.userSessions.findFirst({
        where: and(
          eq(userSessions.id, sessionId),
          eq(userSessions.userId, userId)
        ),
      }),
      'ensureUserSession-find'
    );
    if (existing) {
      await withDbRetry(
        () => db.update(userSessions).set({
          lastActiveAt: now,
          userAgent: userAgent ?? existing.userAgent,
          ip: ip ?? existing.ip,
        }).where(eq(userSessions.id, sessionId)),
        'ensureUserSession-update'
      );
      return { sessionId, isNew: false };
    }
  }

  const newSessionId = generateId();
  await withDbRetry(
    () => db.insert(userSessions).values({
      id: newSessionId,
      userId,
      userAgent,
      ip,
      createdAt: now,
      lastActiveAt: now,
    }),
    'ensureUserSession-insert'
  );

  return { sessionId: newSessionId, isNew: true };
}

export function setSessionCookie(response: NextResponse, sessionId: string): void {
  response.cookies.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
}

export async function deleteUserSession(
  request: NextRequest,
  userId: string
): Promise<boolean> {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return false;

  const [deleted] = await db
    .delete(userSessions)
    .where(and(
      eq(userSessions.id, sessionId),
      eq(userSessions.userId, userId)
    ))
    .returning({ id: userSessions.id });
  return !!deleted;
}
