import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { RouteDeps } from './types.js';
import type { AuthedRequest } from '../infra.js';

export function registerAuthRoutes(deps: RouteDeps): void {
  const { app, sql, redis, infra } = deps;

  app.post('/api/auth/login', async (req, res) => {
    try {
      const parsed = infra.loginSchema.parse(req.body);
      const rows = await sql<{
        id: string;
        email: string;
        name: string;
        avatar_url: string | null;
        email_verified: boolean;
        global_role: string | null;
        password_hash: string;
      }[]>`
        select id, email, name, avatar_url, email_verified, global_role, password_hash
        from users
        where email = ${parsed.email}
        limit 1
      `;
      const user = rows[0];
      if (!user) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }
      const ok = await bcrypt.compare(parsed.password, user.password_hash);
      if (!ok) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      const accessToken = infra.createAccessToken({
        id: user.id,
        email: user.email,
        name: user.name,
        globalRole: user.global_role,
      });
      const refreshToken = infra.createRefreshToken(user.id);
      await infra.createRefreshSession(user.id, refreshToken, req);
      infra.setRefreshCookie(res, refreshToken);
      infra.setAccessCookie(res, accessToken);
      res.json({
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatar_url,
          emailVerified: user.email_verified,
          globalRole: user.global_role ?? 'user',
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', details: error.errors });
        return;
      }
      res.status(500).json({ error: 'Login failed' });
    }
  });

  app.post('/api/auth/register', async (req, res) => {
    try {
      const parsed = infra.registerSchema.parse(req.body);
      const codeRows = await sql<{ id: string }[]>`
        select id from developer_codes where code = ${parsed.developerCode} and used = false limit 1
      `;
      if (!codeRows[0]) {
        res.status(400).json({ error: 'Invalid or already used developer code' });
        return;
      }

      const wlRows = await sql<{ id: string }[]>`
        select id from email_whitelist where email = ${parsed.email} limit 1
      `;
      if (!wlRows[0]) {
        res.status(403).json({ error: 'Email is not whitelisted' });
        return;
      }

      const exists = await sql<{ id: string }[]>`
        select id from users where email = ${parsed.email} limit 1
      `;
      if (exists[0]) {
        res.status(409).json({ error: 'User already exists' });
        return;
      }

      const passwordHash = await bcrypt.hash(parsed.password, 12);
      const inserted = await sql<{
        id: string;
        email: string;
        name: string;
        avatar_url: string | null;
        email_verified: boolean;
        global_role: string | null;
      }[]>`
        insert into users (id, email, password_hash, name, avatar_url, email_verified, global_role, created_at, updated_at)
        values (gen_random_uuid(), ${parsed.email}, ${passwordHash}, ${parsed.name}, null, true, 'user', now(), now())
        returning id, email, name, avatar_url, email_verified, global_role
      `;
      const user = inserted[0];
      if (!user) {
        res.status(500).json({ error: 'Failed to create user' });
        return;
      }

      await sql`
        update developer_codes
        set used = true, used_by = ${user.id}, used_at = now()
        where id = ${codeRows[0].id}
      `;

      const accessToken = infra.createAccessToken({
        id: user.id,
        email: user.email,
        name: user.name,
        globalRole: user.global_role,
      });
      const refreshToken = infra.createRefreshToken(user.id);
      await infra.createRefreshSession(user.id, refreshToken, req);
      infra.setRefreshCookie(res, refreshToken);
      infra.setAccessCookie(res, accessToken);

      res.status(201).json({
        accessToken,
        sessionActive: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatar_url,
          emailVerified: user.email_verified,
          globalRole: user.global_role ?? 'user',
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', details: error.errors });
        return;
      }
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  app.post('/api/auth/refresh', async (req, res) => {
    try {
      const refresh = req.cookies?.[infra.AUTH_REFRESH_COOKIE_NAME] as string | undefined;
      if (!refresh) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const refreshHash = infra.hashToken(refresh);
      const session = await sql<{ user_id: string }[]>`
        select user_id from sessions
        where token_hash = ${refreshHash} and expires_at > now()
        limit 1
      `;
      if (!session[0]) {
        infra.clearRefreshCookie(res);
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const tokenPayload = infra.verifyRefreshToken(refresh);
      if (tokenPayload.sub !== session[0].user_id) {
        infra.clearRefreshCookie(res);
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const users = await sql<{
        id: string;
        email: string;
        name: string;
        global_role: string | null;
      }[]>`
        select id, email, name, global_role from users where id = ${session[0].user_id} limit 1
      `;
      const user = users[0];
      if (!user) {
        infra.clearRefreshCookie(res);
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      await infra.revokeRefreshSession(refresh);
      const nextRefresh = infra.createRefreshToken(user.id);
      await infra.createRefreshSession(user.id, nextRefresh, req);
      infra.setRefreshCookie(res, nextRefresh);

      const accessToken = infra.createAccessToken({
        id: user.id,
        email: user.email,
        name: user.name,
        globalRole: user.global_role,
      });
      infra.setAccessCookie(res, accessToken);
      res.json({ accessToken });
    } catch {
      infra.clearAccessCookie(res);
      infra.clearRefreshCookie(res);
      res.status(401).json({ error: 'Unauthorized' });
    }
  });

  app.post('/api/auth/logout', async (req, res) => {
    const refresh = req.cookies?.[infra.AUTH_REFRESH_COOKIE_NAME] as string | undefined;
    if (refresh) {
      await infra.revokeRefreshSession(refresh);
    }
    infra.clearAccessCookie(res);
    infra.clearRefreshCookie(res);
    res.json({ success: true });
  });

  app.get('/api/auth/me', infra.requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const rows = await sql<{
      id: string;
      email: string;
      name: string;
      avatar_url: string | null;
      email_verified: boolean;
      global_role: string | null;
    }[]>`
      select id, email, name, avatar_url, email_verified, global_role
      from users
      where id = ${userId}
      limit 1
    `;
    const user = rows[0];
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatar_url,
        emailVerified: user.email_verified,
        globalRole: user.global_role ?? 'user',
      },
      accessToken: req.accessToken,
    });
  });

  // Token verification endpoint for WebSocket Gateway
  app.post('/api/auth/verify-token', infra.requireAuth, async (req: AuthedRequest, res) => {
    try {
      const userId = req.user!.id;
      const rows = await sql<{
        id: string;
        email: string;
        name: string;
        avatar_url: string | null;
        global_role: string | null;
      }[]>`
        select id, email, name, avatar_url, global_role
        from users
        where id = ${userId}
        limit 1
      `;
      const user = rows[0];
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      res.json({
        valid: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatar_url,
          globalRole: user.global_role ?? 'user',
        },
      });
    } catch (error) {
      res.status(401).json({ valid: false, error: 'Invalid token' });
    }
  });

  app.post('/api/auth/password/request-reset', async (req, res) => {
    try {
      const parsed = infra.passwordResetRequestSchema.parse(req.body);
      const rows = await sql<{ id: string }[]>`
        select id from users where email = ${parsed.email} limit 1
      `;
      if (!rows[0]) {
        res.json({ success: true });
        return;
      }
      const token = crypto.randomBytes(24).toString('hex');
      await redis.setex(`pwdreset:${token}`, 30 * 60, rows[0].id);
      res.json({ success: true, resetToken: infra.NODE_ENV === 'development' ? token : undefined });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', details: error.errors });
        return;
      }
      res.status(500).json({ error: 'Failed to request reset' });
    }
  });

  app.post('/api/auth/password/confirm-reset', async (req, res) => {
    try {
      const parsed = infra.passwordResetConfirmSchema.parse(req.body);
      const storedUserId = await redis.get(`pwdreset:${parsed.token}`);
      if (!storedUserId) {
        res.status(400).json({ error: 'Invalid or expired reset token' });
        return;
      }
      const userRows = await sql<{ id: string; email: string }[]>`
        select id, email from users where id = ${storedUserId} limit 1
      `;
      const user = userRows[0];
      if (!user || user.email !== parsed.email) {
        res.status(400).json({ error: 'Invalid or expired reset token' });
        return;
      }
      const hash = await bcrypt.hash(parsed.newPassword, 12);
      await sql`
        update users
        set password_hash = ${hash}, updated_at = now()
        where id = ${user.id}
      `;
      await redis.del(`pwdreset:${parsed.token}`);
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', details: error.errors });
        return;
      }
      res.status(500).json({ error: 'Failed to reset password' });
    }
  });

  // Accept license agreement
  app.post('/api/auth/accept-license', infra.requireAuth, async (req: AuthedRequest, res) => {
    try {
      const userId = req.user!.id;
      await sql`
        update users
        set license_accepted = true, license_accepted_at = now(), updated_at = now()
        where id = ${userId}
      `;
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to accept license' });
    }
  });
}
