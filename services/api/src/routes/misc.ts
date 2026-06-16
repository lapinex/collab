import type { RouteDeps } from './types.js';
import type { AuthedRequest } from '../infra.js';

export function registerMiscRoutes(deps: RouteDeps): void {
  const { app, sql, redis, infra } = deps;

  app.get('/health', async (_req, res) => {
    try {
      await sql`select 1`;
      await redis.ping();
      res.json({ status: 'ok', timestamp: Date.now() });
    } catch (error) {
      res.status(503).json({ status: 'degraded', error: String(error) });
    }
  });

  app.get('/api/audit', infra.requireAuth, async (req: AuthedRequest, res) => {
    const serverId = typeof req.query.serverId === 'string' ? req.query.serverId : null;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null;
    if (!serverId) {
      res.status(400).json({ error: 'serverId is required' });
      return;
    }
    const perms = await infra.getServerPermissionBits(req.user!.id, serverId);
    if (!infra.hasPerm(perms, infra.PERM.VIEW_AUDIT_LOG)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const rows = cursor
      ? await sql<{
          id: string; actor_name: string | null; action: string; target_type: string | null; target_id: string | null; meta: Record<string, unknown> | null; created_at: Date;
        }[]>`
          select l.id, u.name as actor_name, l.action, l.target_type, l.target_id, l.meta, l.created_at
          from server_audit_logs l
          left join users u on u.id = l.actor_id
          where l.server_id = ${serverId} and l.created_at < ${new Date(cursor)}
          order by l.created_at desc
          limit 50
        `
      : await sql<{
          id: string; actor_name: string | null; action: string; target_type: string | null; target_id: string | null; meta: Record<string, unknown> | null; created_at: Date;
        }[]>`
          select l.id, u.name as actor_name, l.action, l.target_type, l.target_id, l.meta, l.created_at
          from server_audit_logs l
          left join users u on u.id = l.actor_id
          where l.server_id = ${serverId}
          order by l.created_at desc
          limit 50
        `;
    res.json({
      entries: rows.map((r) => ({
        id: r.id, actorName: r.actor_name, action: r.action, targetType: r.target_type, targetId: r.target_id, meta: r.meta, createdAt: r.created_at.toISOString(),
      })),
      nextCursor: rows.length > 0 ? rows[rows.length - 1]!.created_at.toISOString() : null,
    });
  });

  app.get('/api/permissions/channel', infra.requireAuth, async (req: AuthedRequest, res) => {
    const serverId = typeof req.query.serverId === 'string' ? req.query.serverId : null;
    const channelId = typeof req.query.channelId === 'string' ? req.query.channelId : null;
    if (!serverId || !channelId) {
      res.status(400).json({ error: 'serverId and channelId are required' });
      return;
    }
    if (!(await infra.ensureServerMember(res, req.user!.id, serverId))) return;
    const bits = await infra.getChannelPermissionBits(req.user!.id, channelId);
    if (bits == null) {
      res.status(400).json({ error: 'Channel is not a server channel or not found' });
      return;
    }
    const channelServer = await sql<{ server_id: string }[]>`select server_id from channels where id = ${channelId} limit 1`;
    if (channelServer[0]?.server_id !== serverId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    res.json({ permissions: infra.toPermissionFlags(bits), channelId, serverId });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
}
