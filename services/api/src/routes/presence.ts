import express from 'express';
import { z } from 'zod';
import type { RouteDeps } from './types.js';
import type { AuthedRequest } from '../infra.js';
import { USER_LIMITS } from '../constants.js';

const presencePatchSchema = z.object({
  status: z.enum(['online', 'idle', 'dnd', 'offline']),
  customStatus: z.string().max(USER_LIMITS.MAX_CUSTOM_STATUS_LENGTH).nullable().optional(),
});

export function registerPresenceRoutes(deps: RouteDeps): void {
  const { app, redis, sql, infra } = deps;

  app.get('/api/presence', infra.requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const key = `presence:user:${userId}`;
    const raw = await redis.get(key);
    if (raw) {
      res.json({ presence: JSON.parse(raw) });
      return;
    }
    res.json({
      presence: {
        userId,
        status: 'offline',
        customStatus: null,
        lastSeen: new Date().toISOString(),
      },
    });
  });

  async function handlePresencePatch(req: AuthedRequest, res: express.Response): Promise<void> {
    try {
      const parsed = presencePatchSchema.parse(req.body);
      const userId = req.user!.id;
      const payload = {
        userId,
        status: parsed.status,
        customStatus: parsed.customStatus ?? null,
        lastSeen: new Date().toISOString(),
      };
      await redis.setex(`presence:user:${userId}`, 90, JSON.stringify(payload));
      await redis.sadd('presence:online:users', userId);
      await redis.publish('realtime:presence', JSON.stringify({ event: 'presence:update', payload }));
      res.json({ success: true, presence: payload });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', details: error.errors });
        return;
      }
      res.status(500).json({ error: 'Failed to update presence' });
    }
  }

  app.patch('/api/presence', infra.requireAuth, handlePresencePatch);
  app.put('/api/presence', infra.requireAuth, handlePresencePatch);

  app.post('/api/presence/heartbeat', infra.requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const desired = presencePatchSchema.safeParse(req.body);
    const status = desired.success ? desired.data.status : 'online';
    const payload = {
      userId,
      status,
      customStatus: desired.success ? desired.data.customStatus ?? null : null,
      lastSeen: new Date().toISOString(),
    };
    await redis.setex(`presence:user:${userId}`, 90, JSON.stringify(payload));
    await redis.sadd('presence:online:users', userId);
    await redis.publish('realtime:presence', JSON.stringify({ event: 'presence:update', payload }));
    res.json({ success: true });
  });

  app.get('/api/presence/online', infra.requireAuth, async (req, res) => {
    const serverId = typeof req.query.serverId === 'string' ? req.query.serverId.trim() || null : null;
    const onlineUsers = await redis.smembers('presence:online:users');

    if (!serverId) {
      res.json({ onlineUserIds: onlineUsers });
      return;
    }

    const members = await sql<{ user_id: string }[]>`
      select owner_id as user_id from servers where id = ${serverId}
      union
      select user_id from user_roles where server_id = ${serverId}
    `;
    const memberIds = new Set(members.map((m) => m.user_id));
    const filtered = onlineUsers.filter((id) => memberIds.has(id));
    res.json({ onlineUserIds: filtered });
  });
}
