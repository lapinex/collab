import type { RouteDeps } from './types.js';
import type { AuthedRequest } from '../infra.js';
import { PAGINATION } from '../constants.js';

function setListCacheHeaders(res: {
  setHeader(name: string, value: string): void;
}) {
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  res.setHeader('Vary', 'Accept-Encoding, Cookie');
}

function setRevalidateTags(
  res: {
    setHeader(name: string, value: string): void;
  },
  tags: string[]
) {
  res.setHeader('x-nextjs-revalidate', tags.join(','));
}

export function registerChannelRoutes(deps: RouteDeps): void {
  const { app, sql, infra } = deps;

  app.get('/api/servers/:serverId/channels', infra.requireAuth, async (req: AuthedRequest, res) => {
    const serverId = String(req.params.serverId ?? '');
    const userId = req.user!.id;
    if (!(await infra.ensureServerMember(res, userId, serverId))) return;
    const requestedLimit = Math.min(
      Math.max(Number(req.query.limit ?? PAGINATION.CHANNELS_DEFAULT_LIMIT) || PAGINATION.CHANNELS_DEFAULT_LIMIT, 1),
      infra.CHANNELS_LIST_MAX_LIMIT
    );
    const limit = requestedLimit;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor.trim() : null;
    setListCacheHeaders(res);
    const rows = await sql<{
      id: string;
      server_id: string;
      name: string;
      type: string;
      position: number;
      parent_id: string | null;
      topic: string | null;
    }[]>`
      with cursor_channel as (
        select created_at, position
        from channels
        where id = ${cursor}
          and server_id = ${serverId}
        limit 1
      )
      select id, server_id, name, type, position, parent_id, topic
      from channels
      where server_id = ${serverId}
        and (
          (select created_at from cursor_channel) is null
          or (position, created_at) > (
            select position, created_at
            from cursor_channel
          )
        )
      order by position asc, created_at asc
      limit ${limit + 1}
    `;
    let bitsMap: Map<string, number>;
    try {
      bitsMap = await infra.getChannelPermissionBitsForMany(userId, rows.map((r) => r.id));
    } catch (err) {
      console.error('[channels] getChannelPermissionBitsForMany failed', err);
      res.status(500).json({ error: 'Failed to load channel permissions' });
      return;
    }
    const withView = rows.filter((ch) => {
      const bits = bitsMap.get(ch.id);
      return bits != null && infra.hasPerm(bits, infra.PERM.VIEW_CHANNEL);
    });
    const hasMore = rows.length > limit;
    const page = withView;
    const filteredOutByPermission = rows.length - withView.length;
    res.json({
      channels: page.map((ch) => ({
        id: ch.id,
        serverId: ch.server_id,
        name: ch.name,
        type: ch.type,
        position: ch.position,
        parentId: ch.parent_id,
        topic: ch.topic,
      })),
      hasMore,
      nextCursor: hasMore ? rows[limit]?.id ?? null : null,
      ...(filteredOutByPermission > 0 && { meta: { filteredOutByPermission } }),
    });
  });

  app.post('/api/servers/:serverId/channels', infra.requireAuth, async (req: AuthedRequest, res) => {
    const serverId = String(req.params.serverId);
    const perms = await infra.getServerPermissionBits(req.user!.id, serverId);
    if (!infra.hasPerm(perms, infra.PERM.MANAGE_CHANNELS)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const body = req.body as { name?: string; type?: string; parentId?: string | null; topic?: string | null };
    const name = String(body.name ?? '').trim();
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const inserted = await sql<{ id: string }[]>`
      insert into channels (id, server_id, name, type, position, parent_id, topic, slowmode, created_at, updated_at)
      values (gen_random_uuid(), ${serverId}, ${name}, ${body.type ?? 'text'}, 0, ${body.parentId ?? null}, ${body.topic ?? null}, 0, now(), now())
      returning id
    `;
    await infra.publishRealtime(`server:${serverId}`, 'server:channel_created', {
      channel: {
        id: inserted[0].id,
        serverId,
        name,
        type: body.type ?? 'text',
        position: 0,
        parentId: body.parentId ?? null,
        topic: body.topic ?? null,
        slowmode: 0,
      },
    });
    setRevalidateTags(res, ['channels']);
    res.status(201).json({ channelId: inserted[0].id });
  });

  app.patch('/api/channels/:channelId', infra.requireAuth, async (req: AuthedRequest, res) => {
    const channelId = String(req.params.channelId ?? '');
    const c = await sql<{ server_id: string }[]>`select server_id from channels where id = ${channelId} limit 1`;
    if (!c[0]) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }
    const perms = await infra.getServerPermissionBits(req.user!.id, c[0].server_id);
    if (!infra.hasPerm(perms, infra.PERM.MANAGE_CHANNELS)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const body = req.body as { name?: string; topic?: string | null; parentId?: string | null; position?: number; slowmode?: number };
    await sql`
      update channels
      set name = coalesce(${typeof body.name === 'string' ? body.name : null}, name),
          topic = coalesce(${typeof body.topic === 'string' ? body.topic : null}, topic),
          parent_id = coalesce(${typeof body.parentId === 'string' ? body.parentId : null}, parent_id),
          position = coalesce(${typeof body.position === 'number' ? body.position : null}, position),
          slowmode = coalesce(${typeof body.slowmode === 'number' ? body.slowmode : null}, slowmode),
          updated_at = now()
      where id = ${channelId}
    `;
    const updatedChannel = await sql<{ id: string; server_id: string; name: string; type: string; position: number; parent_id: string | null; topic: string | null; slowmode: number }[]>`
      select id, server_id, name, type, position, parent_id, topic, slowmode from channels where id = ${channelId} limit 1
    `;
    if (updatedChannel[0]) {
      await infra.publishRealtime(`server:${updatedChannel[0].server_id}`, 'server:channel_updated', {
        channel: {
          id: updatedChannel[0].id,
          serverId: updatedChannel[0].server_id,
          name: updatedChannel[0].name,
          type: updatedChannel[0].type,
          position: updatedChannel[0].position,
          parentId: updatedChannel[0].parent_id,
          topic: updatedChannel[0].topic,
          slowmode: updatedChannel[0].slowmode,
        },
      });
    }
    setRevalidateTags(res, ['channels']);
    res.json({ success: true });
  });

  app.delete('/api/channels/:channelId', infra.requireAuth, async (req: AuthedRequest, res) => {
    const channelId = String(req.params.channelId ?? '');
    const c = await sql<{ server_id: string }[]>`select server_id from channels where id = ${channelId} limit 1`;
    if (!c[0]) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }
    const perms = await infra.getServerPermissionBits(req.user!.id, c[0].server_id);
    if (!infra.hasPerm(perms, infra.PERM.MANAGE_CHANNELS)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    await sql`delete from channels where id = ${channelId}`;
    await infra.publishRealtime(`server:${c[0].server_id}`, 'server:channel_deleted', { channelId });
    setRevalidateTags(res, ['channels']);
    res.json({ success: true });
  });

  app.get('/api/channels/:channelId/view', infra.requireAuth, async (req: AuthedRequest, res) => {
    const channelId = String(req.params.channelId ?? '');
    const channelRows = await sql<{
      id: string;
      server_id: string;
      name: string;
      type: string;
      position: number;
      parent_id: string | null;
      topic: string | null;
      slowmode: number;
      created_at: Date;
      updated_at: Date;
    }[]>`
      select id, server_id, name, type, position, parent_id, topic, slowmode, created_at, updated_at
      from channels where id = ${channelId} limit 1
    `;
    const ch = channelRows[0];
    if (!ch) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }
    if (!(await infra.ensureServerMember(res, req.user!.id, ch.server_id))) return;
    const overwriteRows = await sql<{
      id: string;
      channel_id: string;
      role_id: string | null;
      user_id: string | null;
      allow_permissions: number;
      deny_permissions: number;
      role_name: string | null;
      role_color: string | null;
      role_position: number | null;
      user_name: string | null;
      user_avatar_url: string | null;
    }[]>`
      select cp.id, cp.channel_id, cp.role_id, cp.user_id, cp.allow_permissions, cp.deny_permissions,
             r.name as role_name, r.color as role_color, r.position as role_position,
             u.name as user_name, u.avatar_url as user_avatar_url
      from channel_permissions cp
      left join roles r on r.id = cp.role_id
      left join users u on u.id = cp.user_id
      where cp.channel_id = ${channelId}
    `;
    const bits = await infra.getChannelPermissionBits(req.user!.id, ch.id);
    const channelBits = bits != null ? bits : await infra.getServerPermissionBits(req.user!.id, ch.server_id);
    res.json({
      channel: {
        id: ch.id,
        serverId: ch.server_id,
        name: ch.name,
        type: ch.type,
        position: ch.position,
        parentId: ch.parent_id,
        topic: ch.topic,
        slowmode: ch.slowmode,
        createdAt: ch.created_at,
        updatedAt: ch.updated_at,
      },
      permissionOverwrites: overwriteRows.map((r) => ({
        id: r.id,
        channelId: r.channel_id,
        roleId: r.role_id,
        userId: r.user_id,
        allow: r.allow_permissions,
        deny: r.deny_permissions,
        role: r.role_id ? { id: r.role_id, name: r.role_name, color: r.role_color, position: r.role_position } : null,
        user: r.user_id ? { id: r.user_id, name: r.user_name, avatarUrl: r.user_avatar_url } : null,
      })),
      currentUserPermissions: infra.toPermissionFlags(channelBits),
    });
  });

  app.post('/api/channels/:channelId/permissions', infra.requireAuth, async (req: AuthedRequest, res) => {
    const channelId = String(req.params.channelId ?? '');
    const userId = req.user!.id;
    const ch = await sql<{ server_id: string }[]>`select server_id from channels where id = ${channelId} limit 1`;
    if (!ch[0]) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }
    const perms = await infra.getServerPermissionBits(userId, ch[0].server_id);
    if (!infra.hasPerm(perms, infra.PERM.MANAGE_CHANNELS)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const body = req.body as { roleId?: string | null; userId?: string | null; allow?: number; deny?: number };
    const roleId = body.roleId != null && body.roleId !== '' ? body.roleId : null;
    const targetUserId = body.userId != null && body.userId !== '' ? body.userId : null;
    if (roleId === null && targetUserId === null) {
      res.status(400).json({ error: 'roleId or userId is required' });
      return;
    }
    if (roleId !== null && targetUserId !== null) {
      res.status(400).json({ error: 'Provide either roleId or userId, not both' });
      return;
    }
    const allow = typeof body.allow === 'number' ? body.allow : 0;
    const deny = typeof body.deny === 'number' ? body.deny : 0;
    const existing = roleId != null
      ? await sql<{ id: string }[]>`select id from channel_permissions where channel_id = ${channelId} and role_id = ${roleId} limit 1`
      : await sql<{ id: string }[]>`select id from channel_permissions where channel_id = ${channelId} and user_id = ${targetUserId} limit 1`;
    if (existing[0]) {
      await sql`
        update channel_permissions
        set allow_permissions = ${allow}, deny_permissions = ${deny}
        where id = ${existing[0].id}
      `;
      setRevalidateTags(res, ['channels']);
      return res.json({ overwrite: { id: existing[0].id, channelId, roleId, userId: targetUserId, allow, deny } });
    }
    const inserted = await sql<{ id: string }[]>`
      insert into channel_permissions (channel_id, role_id, user_id, allow_permissions, deny_permissions)
      values (${channelId}, ${roleId}, ${targetUserId}, ${allow}, ${deny})
      returning id
    `;
    setRevalidateTags(res, ['channels']);
    res.status(201).json({
      overwrite: {
        id: inserted[0].id,
        channelId,
        roleId,
        userId: targetUserId,
        allow,
        deny,
      },
    });
  });

  app.delete('/api/channels/:channelId/permissions/:overwriteId', infra.requireAuth, async (req: AuthedRequest, res) => {
    const channelId = String(req.params.channelId ?? '');
    const overwriteId = String(req.params.overwriteId ?? '');
    const ch = await sql<{ server_id: string }[]>`select server_id from channels where id = ${channelId} limit 1`;
    if (!ch[0]) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }
    const perms = await infra.getServerPermissionBits(req.user!.id, ch[0].server_id);
    if (!infra.hasPerm(perms, infra.PERM.MANAGE_CHANNELS)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const deleted = await sql<{ id: string }[]>`
      delete from channel_permissions where id = ${overwriteId} and channel_id = ${channelId}
      returning id
    `;
    setRevalidateTags(res, ['channels']);
    if (deleted.length === 0) {
      return res.status(404).json({ error: 'Overwrite not found' });
    }
    res.json({ success: true });
  });
}
