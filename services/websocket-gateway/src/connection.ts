import WebSocket from 'ws';
import type { AuthenticatedConnection } from './types.js';
import { verifyJwt } from './auth/jwks.js';
import { getDb } from './db.js';
import { users } from '@collab/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { Connection } from './types.js';

/**
 * Authenticate WebSocket connection using Supabase JWT token
 * 
 * IMPORTANT: Only ES256 tokens are supported (Supabase access_token).
 * Tokens must be signed by Supabase Auth and verified via JWKS.
 * 
 * @param _ws - WebSocket instance (unused, kept for API compatibility)
 * @param token - Supabase access_token (ES256 JWT) from WebSocket handshake
 * @returns AuthenticatedConnection if valid, null otherwise
 */
export async function authenticateConnection(
  _ws: WebSocket,
  token: string
): Promise<AuthenticatedConnection | null> {
  try {
    // Verify Supabase access_token (ES256 only, verified via JWKS)
    const jwt = await verifyJwt(token);
    const db = getDb();

    // Connection-time: user must exist (zero trust)
    // Even if JWT is valid, user must exist in database
    let user = await db.query.users.findFirst({
      where: eq(users.id, jwt.userId),
      columns: { id: true, email: true, name: true },
    });

    if (!user && jwt.email) {
      user = await db.query.users.findFirst({
        where: eq(users.email, jwt.email),
        columns: { id: true, email: true, name: true },
      });
    }

    if (!user) {
      // Don't log full token for security
      console.warn(`[Auth] User ${jwt.userId} not found in database`);
      return null;
    }

    return {
      userId: user.id,
      email: user.email || jwt.email,
      name: user.name ?? null,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
      subscribedChannels: new Set<string>(),
    };
  } catch (error) {
    // Log error but don't expose token or sensitive details
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.warn(`[Auth] JWT verification failed: ${errorMsg}`);
    return null;
  }
}

export function sendMessage(
  ws: WebSocket,
  type: string,
  payload: unknown,
  requestId?: string,
  nonce?: string
): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        v: 1,
        type,
        payload,
        nonce,
        requestId,
      })
    );
  }
}

export function sendInternalError(
  ws: WebSocket,
  payload: { code: string; message?: string },
  requestId?: string,
  nonce?: string
): void {
  sendMessage(ws, 'internal:error', payload, requestId, nonce);
}

export function sendAuthError(
  ws: WebSocket,
  payload: { code: string; message?: string },
  requestId?: string,
  nonce?: string
): void {
  sendMessage(ws, 'auth:error', payload, requestId, nonce);
}

export function sendPermissionError(
  ws: WebSocket,
  payload: { code: string; message?: string },
  requestId?: string,
  nonce?: string
): void {
  sendMessage(ws, 'permission:error', payload, requestId, nonce);
}

export function sendRateLimitError(
  ws: WebSocket,
  payload: { code: string; message?: string; retryAfterMs?: number },
  requestId?: string,
  nonce?: string
): void {
  sendMessage(ws, 'rate_limit:error', payload, requestId, nonce);
}

// Back-compat (some handlers still call sendError)
export function sendError(ws: WebSocket, error: string, requestId?: string): void {
  sendInternalError(ws, { code: 'UNKNOWN', message: error }, requestId);
}

export function isConnectionAlive(connection: Connection): boolean {
  const HEARTBEAT_TIMEOUT = 120000; // 2 minutes
  const now = Date.now();
  const lastHeartbeat = connection.lastHeartbeat.getTime();
  return now - lastHeartbeat < HEARTBEAT_TIMEOUT;
}
