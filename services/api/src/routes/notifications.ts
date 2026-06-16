import type { RouteDeps } from './types.js';
import type { AuthedRequest } from '../infra.js';

export function registerNotificationRoutes(deps: RouteDeps): void {
  const { app, sql, infra } = deps;

  app.get('/api/notifications', infra.requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const unreadOnly = req.query.unread === 'true';
    const typeFilter = typeof req.query.type === 'string' ? req.query.type.trim() : null;
    type Row = {
      id: string;
      type: string;
      message_id: string | null;
      channel_id: string | null;
      server_id: string | null;
      dm_id: string | null;
      read_at: Date | null;
      created_at: Date;
      payload: unknown;
    };
    let rows: Row[];
    let total = 0;
    if (unreadOnly && typeFilter) {
      rows = await sql<Row[]>`
        select id, type, message_id, channel_id, server_id, dm_id, read_at, created_at, payload
        from notifications
        where user_id = ${userId} and read_at is null and type = ${typeFilter}
        order by created_at desc
        limit ${limit} offset ${offset}
      `;
      const tc = await sql<{ count: string }[]>`
        select count(*)::text as count from notifications where user_id = ${userId} and read_at is null and type = ${typeFilter}
      `;
      total = parseInt(tc[0]?.count ?? '0', 10);
    } else if (unreadOnly) {
      rows = await sql<Row[]>`
        select id, type, message_id, channel_id, server_id, dm_id, read_at, created_at, payload
        from notifications
        where user_id = ${userId} and read_at is null
        order by created_at desc
        limit ${limit} offset ${offset}
      `;
      const tc = await sql<{ count: string }[]>`
        select count(*)::text as count from notifications where user_id = ${userId} and read_at is null
      `;
      total = parseInt(tc[0]?.count ?? '0', 10);
    } else if (typeFilter) {
      rows = await sql<Row[]>`
        select id, type, message_id, channel_id, server_id, dm_id, read_at, created_at, payload
        from notifications
        where user_id = ${userId} and type = ${typeFilter}
        order by created_at desc
        limit ${limit} offset ${offset}
      `;
      const tc = await sql<{ count: string }[]>`
        select count(*)::text as count from notifications where user_id = ${userId} and type = ${typeFilter}
      `;
      total = parseInt(tc[0]?.count ?? '0', 10);
    } else {
      rows = await sql<Row[]>`
        select id, type, message_id, channel_id, server_id, dm_id, read_at, created_at, payload
        from notifications
        where user_id = ${userId}
        order by created_at desc
        limit ${limit} offset ${offset}
      `;
      const tc = await sql<{ count: string }[]>`
        select count(*)::text as count from notifications where user_id = ${userId}
      `;
      total = parseInt(tc[0]?.count ?? '0', 10);
    }
    res.json({
      notifications: rows.map((n) => ({
        id: n.id,
        type: n.type,
        userId,
        messageId: n.message_id,
        channelId: n.channel_id,
        serverId: n.server_id,
        dmId: n.dm_id,
        readAt: n.read_at ? n.read_at.toISOString() : null,
        createdAt: n.created_at.toISOString(),
        payload: n.payload ?? null,
      })),
      total,
    });
  });

  app.get('/api/notifications/unread', infra.requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const rows = await sql<{
      id: string;
      type: string;
      message_id: string | null;
      channel_id: string | null;
      server_id: string | null;
      dm_id: string | null;
      read_at: Date | null;
      created_at: Date;
      payload: unknown;
    }[]>`
      select id, type, message_id, channel_id, server_id, dm_id, read_at, created_at, payload
      from notifications
      where user_id = ${userId} and read_at is null
      order by created_at desc
      limit 100
    `;
    res.json({
      notifications: rows.map((n) => ({
        id: n.id,
        type: n.type,
        userId,
        messageId: n.message_id,
        channelId: n.channel_id,
        serverId: n.server_id,
        dmId: n.dm_id,
        readAt: null,
        createdAt: n.created_at.toISOString(),
        payload: n.payload ?? null,
      })),
      unreadCount: rows.length,
    });
  });

  app.patch('/api/notifications/:id/read', infra.requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      res.status(400).json({ error: 'id required' });
      return;
    }
    await sql`
      update notifications
      set read_at = now()
      where id = ${id} and user_id = ${userId}
    `;
    res.json({ success: true });
  });

  app.post('/api/notifications/read-all', infra.requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    await sql`
      update notifications set read_at = now() where user_id = ${userId} and read_at is null
    `;
    res.json({ success: true });
  });

  app.post('/api/notifications/mark-channel-read', infra.requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const body = req.body as { channelId?: string };
    if (!body.channelId) {
      res.status(400).json({ error: 'channelId is required' });
      return;
    }
    await sql`
      update notifications
      set read_at = now()
      where user_id = ${userId} and channel_id = ${body.channelId} and read_at is null
    `;
    res.json({ success: true });
  });

  app.get('/api/notifications/badges', infra.requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const channelIdsParam = typeof req.query.channelIds === 'string' ? req.query.channelIds : '';
    const dmIdsParam = typeof req.query.dmIds === 'string' ? req.query.dmIds : '';
    const serverIdsParam = typeof req.query.serverIds === 'string' ? req.query.serverIds : '';
    const channelIds = channelIdsParam ? channelIdsParam.split(',').filter(Boolean) : [];
    const dmIds = dmIdsParam ? dmIdsParam.split(',').filter(Boolean) : [];
    const serverIds = serverIdsParam ? serverIdsParam.split(',').filter(Boolean) : [];

    const rows = await sql<{ channel_id: string | null; server_id: string | null; count: string }[]>`
      select channel_id, server_id, count(*)::text as count
      from notifications
      where user_id = ${userId} and read_at is null
      group by channel_id, server_id
    `;
    const channels: Record<string, { unread: number; mentions: number }> = {};
    const dms: Record<string, { unread: number }> = {};
    const servers: Record<string, { unread: number; mentions: number }> = {};

    for (const id of channelIds) channels[id] = { unread: 0, mentions: 0 };
    for (const id of dmIds) dms[id] = { unread: 0 };
    for (const id of serverIds) servers[id] = { unread: 0, mentions: 0 };

    for (const row of rows) {
      const count = Number(row.count);
      if (row.channel_id && channels[row.channel_id]) {
        channels[row.channel_id].unread = count;
      }
      if (row.channel_id && dms[row.channel_id]) {
        dms[row.channel_id].unread = count;
      }
      if (row.server_id && servers[row.server_id]) {
        servers[row.server_id].unread += count;
      }
    }
    res.json({ servers, channels, dms });
  });

  app.get('/api/notifications/settings', infra.requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const rows = await sql<{ notifications_enabled: boolean | null; notifications_sound: boolean | null }[]>`
      select notifications_enabled, notifications_sound from user_settings where user_id = ${userId} limit 1
    `;
    const r = rows[0];
    res.json({
      desktopEnabled: r?.notifications_enabled ?? true,
      sound: r?.notifications_sound ?? true,
      hidePreview: false,
    });
  });

  app.patch('/api/notifications/settings', infra.requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const body = req.body as { desktopEnabled?: boolean; sound?: boolean; hidePreview?: boolean };
    if (body.desktopEnabled !== undefined) {
      await sql`
        insert into user_settings (user_id, notifications_enabled, notifications_sound, updated_at, created_at, language, preferred_language, auto_translate, privacy_show_email, privacy_show_online_status, notifications_mentions)
        values (${userId}, ${body.desktopEnabled}, true, now(), now(), 'en', 'en', false, false, true, true)
        on conflict (user_id) do update set notifications_enabled = ${body.desktopEnabled}, updated_at = now()
      `;
    }
    if (body.sound !== undefined) {
      await sql`
        insert into user_settings (user_id, notifications_enabled, notifications_sound, updated_at, created_at, language, preferred_language, auto_translate, privacy_show_email, privacy_show_online_status, notifications_mentions)
        values (${userId}, true, ${body.sound}, now(), now(), 'en', 'en', false, false, true, true)
        on conflict (user_id) do update set notifications_sound = ${body.sound}, updated_at = now()
      `;
    }
    res.json({ success: true });
  });
}
