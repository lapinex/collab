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

async function getMemberMaxRolePosition(
  sql: RouteDeps['sql'],
  serverId: string,
  userId: string
): Promise<number> {
  const owner = await sql<{ owner_id: string }[]>`
    select owner_id from servers where id = ${serverId} limit 1
  `;
  if (owner[0]?.owner_id === userId) return Number.MAX_SAFE_INTEGER;

  const rows = await sql<{ max_position: number | null }[]>`
    select max(r.position)::int as max_position
    from user_roles ur
    inner join roles r on r.id = ur.role_id
    where ur.server_id = ${serverId} and ur.user_id = ${userId}
  `;
  return rows[0]?.max_position ?? 0;
}

export function registerServerRoutes(deps: RouteDeps): void {
  const { app, sql, infra } = deps;

  const publishServerMemberEvent = async (
    serverId: string,
    event: 'server:member_joined' | 'server:member_removed',
    payload: Record<string, unknown>
  ) => {
    const members = await sql<{ user_id: string }[]>`
      with member_ids as (
        select owner_id as user_id from servers where id = ${serverId}
        union
        select user_id from user_roles where server_id = ${serverId}
      )
      select distinct user_id from member_ids
    `;
    await Promise.all(
      members.map((m) =>
        infra.publishRealtime(`user:${m.user_id}`, event, payload).catch(() => undefined)
      )
    );
  };

  app.get('/api/servers', infra.requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const limit = Math.min(Math.max(Number(req.query.limit ?? PAGINATION.SERVERS_DEFAULT_LIMIT) || PAGINATION.SERVERS_DEFAULT_LIMIT, 1), PAGINATION.SERVERS_MAX_LIMIT);
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor.trim() : null;
    setListCacheHeaders(res);
    const rows = await sql<{
      id: string;
      name: string;
      icon_url: string | null;
      description: string | null;
      owner_id: string;
      created_at: Date;
    }[]>`
      with cursor_server as (
        select created_at
        from servers
        where id = ${cursor}
        limit 1
      )
      select distinct s.id, s.name, s.icon_url, s.description, s.owner_id, s.created_at
      from servers s
      left join user_roles ur on ur.server_id = s.id
      where (s.owner_id = ${userId} or ur.user_id = ${userId})
        and (
          (select created_at from cursor_server) is null
          or s.created_at > (select created_at from cursor_server)
        )
      order by s.created_at asc
      limit ${limit + 1}
    `;
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    res.json({
      servers: page.map((s) => ({
        id: s.id,
        name: s.name,
        iconUrl: s.icon_url,
        description: s.description,
        ownerId: s.owner_id,
        createdAt: s.created_at,
      })),
      hasMore,
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    });
  });

  app.post('/api/servers', infra.requireAuth, async (req: AuthedRequest, res) => {
    const ownerId = req.user!.id;
    const body = req.body as { name?: string; description?: string | null; iconUrl?: string | null };
    const name = String(body.name ?? '').trim();
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const result = await sql.begin(async (tx) => {
      const run = tx as unknown as typeof sql;
      const created = await run<{ id: string; name: string; owner_id: string; icon_url: string | null; description: string | null; created_at: Date; updated_at: Date }[]>`
        insert into servers (id, name, icon_url, description, owner_id, created_at, updated_at)
        values (gen_random_uuid(), ${name}, ${body.iconUrl ?? null}, ${body.description ?? null}, ${ownerId}, now(), now())
        returning id, name, owner_id, icon_url, description, created_at, updated_at
      `;
      const row = created[0]!;
      const ownerRole = await run<{ id: string }[]>`
        insert into roles (id, server_id, name, color, position, permissions, created_at, updated_at)
        values (gen_random_uuid(), ${row.id}, 'Owner', '#f04747', 1000, ${infra.ownerPermissions()}, now(), now())
        returning id
      `;
      await run`
        insert into roles (id, server_id, name, color, position, permissions, created_at, updated_at)
        values (gen_random_uuid(), ${row.id}, '@everyone', '#99aab5', 0, ${infra.defaultMemberPermissions()}, now(), now())
      `;
      await run`
        insert into user_roles (user_id, role_id, server_id)
        values (${ownerId}, ${ownerRole[0].id}, ${row.id})
        on conflict do nothing
      `;
      await run`
        insert into channels (id, server_id, name, type, position, parent_id, topic, slowmode, created_at, updated_at)
        values
        (gen_random_uuid(), ${row.id}, 'general', 'text', 0, null, null, 0, now(), now()),
        (gen_random_uuid(), ${row.id}, 'voice', 'voice', 1, null, null, 0, now(), now())
      `;
      return row;
    });
    setRevalidateTags(res, ['servers', 'channels']);
    res.status(201).json({
      server: {
        id: result.id,
        name: result.name,
        iconUrl: result.icon_url,
        description: result.description,
        ownerId: result.owner_id,
        createdAt: result.created_at,
        updatedAt: result.updated_at,
      },
    });
  });

  app.patch('/api/servers/:serverId', infra.requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const serverId = String(req.params.serverId);
    const owner = await sql<{ owner_id: string }[]>`select owner_id from servers where id = ${serverId} limit 1`;
    if (!owner[0]) {
      res.status(404).json({ error: 'Server not found' });
      return;
    }
    if (owner[0].owner_id !== userId) {
      const perms = await infra.getServerPermissionBits(userId, serverId);
      if (!infra.hasPerm(perms, infra.PERM.MANAGE_SERVER)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    }
    const body = req.body as Record<string, unknown>;
    const verificationLevel = typeof body.verificationLevel === 'string' ? body.verificationLevel : null;
    const voiceRegion = typeof body.voiceRegion === 'string' ? body.voiceRegion : null;
    const mediaScanLevel = typeof body.mediaScanLevel === 'string' ? body.mediaScanLevel : null;
    const linkFilterEnabled = typeof body.linkFilterEnabled === 'boolean' ? body.linkFilterEnabled : null;
    const badWordsFilterLevel = typeof body.badWordsFilterLevel === 'string' ? body.badWordsFilterLevel : null;
    const customBadWords = body.customBadWords !== undefined ? (Array.isArray(body.customBadWords) ? body.customBadWords : null) : undefined;
    const isCommunity = typeof body.isCommunity === 'boolean' ? body.isCommunity : null;
    const rulesChannelId = body.rulesChannelId !== undefined ? (typeof body.rulesChannelId === 'string' ? body.rulesChannelId : null) : undefined;
    const announcementsChannelId = body.announcementsChannelId !== undefined ? (typeof body.announcementsChannelId === 'string' ? body.announcementsChannelId : null) : undefined;
    await sql`
      update servers
      set
        name = coalesce(${typeof body.name === 'string' ? body.name : null}, name),
        description = coalesce(${typeof body.description === 'string' ? body.description : null}, description),
        icon_url = coalesce(${typeof body.iconUrl === 'string' ? body.iconUrl : null}, icon_url),
        verification_level = coalesce(${verificationLevel}, verification_level),
        voice_region = coalesce(${voiceRegion}, voice_region),
        media_scan_level = coalesce(${mediaScanLevel}, media_scan_level),
        link_filter_enabled = coalesce(${linkFilterEnabled}, link_filter_enabled),
        bad_words_filter_level = coalesce(${badWordsFilterLevel}, bad_words_filter_level),
        is_community = coalesce(${isCommunity}, is_community),
        updated_at = now()
      where id = ${serverId}
    `;
    if (customBadWords !== undefined) {
      await sql`update servers set custom_bad_words = ${customBadWords} where id = ${serverId}`;
    }
    if (rulesChannelId !== undefined) {
      await sql`update servers set rules_channel_id = ${rulesChannelId} where id = ${serverId}`;
    }
    if (announcementsChannelId !== undefined) {
      await sql`update servers set announcements_channel_id = ${announcementsChannelId} where id = ${serverId}`;
    }
    await infra.publishRealtime(`server:${serverId}`, 'server:settings_updated', {
      serverId,
      updates: body,
    });
    setRevalidateTags(res, ['servers']);
    res.json({ success: true });
  });

  app.delete('/api/servers/:serverId', infra.requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const serverId = String(req.params.serverId);
    const owner = await sql<{ owner_id: string }[]>`select owner_id from servers where id = ${serverId} limit 1`;
    if (!owner[0]) {
      res.status(404).json({ error: 'Server not found' });
      return;
    }
    if (owner[0].owner_id !== userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    await sql`delete from servers where id = ${serverId}`;
    setRevalidateTags(res, ['servers', 'channels']);
    res.json({ success: true });
  });

  app.get('/api/servers/:serverId/members', infra.requireAuth, async (req: AuthedRequest, res) => {
    const serverId = String(req.params.serverId);
    const userId = req.user!.id;
    if (!(await infra.ensureServerMember(res, userId, serverId))) return;
    const rows = await sql<{
      id: string;
      name: string;
      email: string;
      avatar_url: string | null;
      nickname: string | null;
      is_owner: boolean;
      role_id: string | null;
      role_name: string | null;
      role_color: string | null;
      role_position: number | null;
    }[]>`
      with members as (
        select u.id, u.name, u.email, u.avatar_url,
               (u.id = s.owner_id) as is_owner
        from users u
        inner join servers s on s.id = ${serverId}
        where u.id = s.owner_id
        union
        select u.id, u.name, u.email, u.avatar_url, false as is_owner
        from users u
        where exists (
          select 1 from user_roles ur where ur.user_id = u.id and ur.server_id = ${serverId}
        )
      )
      select m.id, m.name, m.email, m.avatar_url, sp.nickname, m.is_owner,
             r.id as role_id, r.name as role_name, r.color as role_color, r.position as role_position
      from members m
      left join server_profiles sp on sp.user_id = m.id and sp.server_id = ${serverId}
      left join user_roles ur on ur.user_id = m.id and ur.server_id = ${serverId}
      left join roles r on r.id = ur.role_id
      order by m.is_owner desc, m.name asc, r.position desc
    `;
    const grouped = new Map<string, {
      id: string;
      userId: string;
      name: string;
      email: string;
      avatarUrl: string | null;
      nickname: string | null;
      isOwner: boolean;
      roles: Array<{ id: string; name: string; color: string; position: number }>;
    }>();
    for (const r of rows) {
      if (!grouped.has(r.id)) {
        grouped.set(r.id, {
          id: r.id,
          userId: r.id,
          name: r.name,
          email: r.email,
          avatarUrl: r.avatar_url,
          nickname: r.nickname,
          isOwner: r.is_owner,
          roles: [],
        });
      }
      if (r.role_id && r.role_name && r.role_color != null && r.role_position != null) {
        grouped.get(r.id)!.roles.push({
          id: r.role_id,
          name: r.role_name,
          color: r.role_color,
          position: r.role_position,
        });
      }
    }
    const members = Array.from(grouped.values()).map((m) => ({
      ...m,
      avatar: m.avatarUrl,
      roleName: m.roles[0]?.name ?? null,
      roleColor: m.roles[0]?.color ?? null,
    }));
    res.json({ members });
  });

  app.get('/api/servers/:serverId/members/:memberId', infra.requireAuth, async (req: AuthedRequest, res) => {
    const serverId = String(req.params.serverId);
    const memberId = String(req.params.memberId);
    if (!(await infra.ensureServerMember(res, req.user!.id, serverId))) return;
    const data = await sql<{
      id: string;
      name: string;
      email: string;
      avatar_url: string | null;
      nickname: string | null;
      is_owner: boolean;
      role_id: string | null;
      role_name: string | null;
      role_color: string | null;
      role_position: number | null;
    }[]>`
      select u.id, u.name, u.email, u.avatar_url, sp.nickname, (u.id = s.owner_id) as is_owner,
             r.id as role_id, r.name as role_name, r.color as role_color, r.position as role_position
      from users u
      inner join servers s on s.id = ${serverId}
      left join server_profiles sp on sp.user_id = u.id and sp.server_id = ${serverId}
      left join user_roles ur on ur.user_id = u.id and ur.server_id = ${serverId}
      left join roles r on r.id = ur.role_id
      where u.id = ${memberId} and (u.id = s.owner_id or exists (select 1 from user_roles ur2 where ur2.server_id = ${serverId} and ur2.user_id = u.id))
      order by r.position desc
    `;
    if (!data[0]) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }
    const base = data[0];
    const roles = data
      .filter((r) => r.role_id && r.role_name && r.role_color != null && r.role_position != null)
      .map((r) => ({
        id: r.role_id!,
        name: r.role_name!,
        color: r.role_color!,
        position: r.role_position!,
      }));
    res.json({
      members: [{
        id: base.id,
        userId: base.id,
        name: base.name,
        email: base.email,
        avatarUrl: base.avatar_url,
        avatar: base.avatar_url,
        nickname: base.nickname,
        isOwner: base.is_owner,
        roles,
        roleName: roles[0]?.name ?? null,
        roleColor: roles[0]?.color ?? null,
      }],
    });
  });

  app.post('/api/servers/:serverId/members/:memberId/role', infra.requireAuth, async (req: AuthedRequest, res) => {
    const serverId = String(req.params.serverId);
    const memberId = String(req.params.memberId);
    const roleId = (req.body as { roleId?: string }).roleId;
    if (!roleId) {
      res.status(400).json({ error: 'roleId is required' });
      return;
    }
    const roleRows = await sql<{ server_id: string }[]>`select server_id from roles where id = ${roleId} and server_id = ${serverId} limit 1`;
    if (!roleRows[0]) {
      res.status(400).json({ error: 'Role not found or does not belong to this server' });
      return;
    }
    const memberCheck = await sql<{ ok: number }[]>`
      select 1 as ok from servers where id = ${serverId} and owner_id = ${memberId}
      union all
      select 1 as ok from user_roles where server_id = ${serverId} and user_id = ${memberId} limit 1
      limit 1
    `;
    if (!memberCheck[0]) {
      res.status(404).json({ error: 'Member not found in this server' });
      return;
    }
    const perms = await infra.getServerPermissionBits(req.user!.id, serverId);
    if (!infra.hasPerm(perms, infra.PERM.MANAGE_ROLES)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    await sql`
      insert into user_roles (user_id, role_id, server_id)
      values (${memberId}, ${roleId}, ${serverId})
      on conflict do nothing
    `;
    const roleData = await sql<{ id: string; name: string; color: string; permissions: number }[]>`
      select id, name, color, permissions from roles where id = ${roleId} limit 1
    `;
    await infra.publishRealtime(`user:${memberId}`, 'server:role_added', {
      serverId,
      role: {
        id: roleData[0]?.id ?? roleId,
        name: roleData[0]?.name ?? 'Role',
        color: roleData[0]?.color ?? '#99aab5',
        permissions: roleData[0]?.permissions ?? 0,
      },
    });
    res.json({ success: true });
  });

  app.delete('/api/servers/:serverId/members/:memberId/role', infra.requireAuth, async (req: AuthedRequest, res) => {
    const serverId = String(req.params.serverId);
    const memberId = String(req.params.memberId);
    const roleId = typeof req.query.roleId === 'string' ? req.query.roleId : null;
    if (!roleId) {
      res.status(400).json({ error: 'roleId is required' });
      return;
    }
    const roleRows = await sql<{ server_id: string }[]>`select server_id from roles where id = ${roleId} and server_id = ${serverId} limit 1`;
    if (!roleRows[0]) {
      res.status(400).json({ error: 'Role not found or does not belong to this server' });
      return;
    }
    const memberCheck = await sql<{ ok: number }[]>`
      select 1 as ok from servers where id = ${serverId} and owner_id = ${memberId}
      union all
      select 1 as ok from user_roles where server_id = ${serverId} and user_id = ${memberId} limit 1
      limit 1
    `;
    if (!memberCheck[0]) {
      res.status(404).json({ error: 'Member not found in this server' });
      return;
    }
    const perms = await infra.getServerPermissionBits(req.user!.id, serverId);
    if (!infra.hasPerm(perms, infra.PERM.MANAGE_ROLES)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    await sql`delete from user_roles where user_id = ${memberId} and role_id = ${roleId} and server_id = ${serverId}`;
    await infra.publishRealtime(`user:${memberId}`, 'server:role_removed', {
      serverId,
      roleId,
    });
    res.json({ success: true });
  });

  app.post('/api/servers/:serverId/members/:memberId/kick', infra.requireAuth, async (req: AuthedRequest, res) => {
    const serverId = String(req.params.serverId);
    const memberId = String(req.params.memberId);
    if (memberId === req.user!.id) {
      res.status(400).json({ error: 'You cannot kick yourself' });
      return;
    }
    const perms = await infra.getServerPermissionBits(req.user!.id, serverId);
    if (!infra.hasPerm(perms, infra.PERM.KICK_MEMBERS)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const actorPos = await getMemberMaxRolePosition(sql, serverId, req.user!.id);
    const targetPos = await getMemberMaxRolePosition(sql, serverId, memberId);
    if (actorPos <= targetPos) {
      res.status(403).json({ error: 'Cannot moderate member with equal or higher role' });
      return;
    }

    await sql`delete from user_roles where user_id = ${memberId} and server_id = ${serverId}`;
    await infra.publishRealtime(`user:${memberId}`, 'server:kicked', { serverId });
    await infra.publishRealtime(`server:${serverId}`, 'server:member_removed', { userId: memberId, reason: 'kicked' });
    await publishServerMemberEvent(serverId, 'server:member_removed', { serverId, userId: memberId, reason: 'kicked' });
    res.json({ success: true });
  });

  app.post('/api/servers/:serverId/members/:memberId/ban', infra.requireAuth, async (req: AuthedRequest, res) => {
    const serverId = String(req.params.serverId);
    const memberId = String(req.params.memberId);
    if (memberId === req.user!.id) {
      res.status(400).json({ error: 'You cannot ban yourself' });
      return;
    }
    const perms = await infra.getServerPermissionBits(req.user!.id, serverId);
    if (!infra.hasPerm(perms, infra.PERM.BAN_MEMBERS)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const actorPos = await getMemberMaxRolePosition(sql, serverId, req.user!.id);
    const targetPos = await getMemberMaxRolePosition(sql, serverId, memberId);
    if (actorPos <= targetPos) {
      res.status(403).json({ error: 'Cannot moderate member with equal or higher role' });
      return;
    }

    await sql`
      insert into banned_members (id, server_id, user_id, banned_by, reason, created_at)
      values (gen_random_uuid(), ${serverId}, ${memberId}, ${req.user!.id}, null, now())
      on conflict (server_id, user_id) do update set banned_by = excluded.banned_by, created_at = now()
    `;
    await sql`delete from user_roles where user_id = ${memberId} and server_id = ${serverId}`;
    await infra.publishRealtime(`user:${memberId}`, 'server:banned', { serverId });
    await infra.publishRealtime(`server:${serverId}`, 'server:member_removed', { userId: memberId, reason: 'banned' });
    await publishServerMemberEvent(serverId, 'server:member_removed', { serverId, userId: memberId, reason: 'banned' });
    res.json({ success: true });
  });

  app.get('/api/servers/:serverId/roles', infra.requireAuth, async (req: AuthedRequest, res) => {
    const serverId = String(req.params.serverId);
    if (!(await infra.ensureServerMember(res, req.user!.id, serverId))) return;
    const rows = await sql<{ id: string; server_id: string; name: string; color: string; position: number; permissions: number; created_at: Date; updated_at: Date }[]>`
      select id, server_id, name, color, position, permissions, created_at, updated_at
      from roles
      where server_id = ${serverId}
      order by position desc, created_at asc
    `;
    res.json({
      roles: rows.map((r) => ({
        id: r.id,
        serverId: r.server_id,
        name: r.name,
        color: r.color,
        position: r.position,
        permissions: r.permissions,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  });

  app.post('/api/servers/:serverId/roles', infra.requireAuth, async (req: AuthedRequest, res) => {
    const serverId = String(req.params.serverId);
    const perms = await infra.getServerPermissionBits(req.user!.id, serverId);
    if (!infra.hasPerm(perms, infra.PERM.MANAGE_ROLES)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const body = req.body as { name?: string; color?: string; permissions?: number };
    const name = String(body.name ?? '').trim();
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const inserted = await sql<{ id: string }[]>`
      insert into roles (id, server_id, name, color, position, permissions, created_at, updated_at)
      values (gen_random_uuid(), ${serverId}, ${name}, ${body.color ?? '#99aab5'}, 1, ${body.permissions ?? infra.defaultMemberPermissions()}, now(), now())
      returning id
    `;
    await infra.publishRealtime(`server:${serverId}`, 'server:role_created', {
      role: {
        id: inserted[0].id,
        serverId,
        name,
        color: body.color ?? '#99aab5',
        position: 1,
        permissions: body.permissions ?? infra.defaultMemberPermissions(),
      },
    });
    res.status(201).json({ roleId: inserted[0].id });
  });

  app.patch('/api/servers/:serverId/roles/:roleId', infra.requireAuth, async (req: AuthedRequest, res) => {
    const serverId = String(req.params.serverId);
    const roleId = String(req.params.roleId);
    const perms = await infra.getServerPermissionBits(req.user!.id, serverId);
    if (!infra.hasPerm(perms, infra.PERM.MANAGE_ROLES)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const body = req.body as { name?: string; color?: string; permissions?: number; position?: number };
    await sql`
      update roles
      set name = coalesce(${typeof body.name === 'string' ? body.name : null}, name),
          color = coalesce(${typeof body.color === 'string' ? body.color : null}, color),
          permissions = coalesce(${typeof body.permissions === 'number' ? body.permissions : null}, permissions),
          position = coalesce(${typeof body.position === 'number' ? body.position : null}, position),
          updated_at = now()
      where id = ${roleId} and server_id = ${serverId}
    `;
    const updatedRole = await sql<{ id: string; name: string; color: string; position: number; permissions: number }[]>`
      select id, name, color, position, permissions from roles where id = ${roleId} limit 1
    `;
    if (updatedRole[0]) {
      await infra.publishRealtime(`server:${serverId}`, 'server:role_updated', {
        role: {
          id: updatedRole[0].id,
          serverId,
          name: updatedRole[0].name,
          color: updatedRole[0].color,
          position: updatedRole[0].position,
          permissions: updatedRole[0].permissions,
        },
      });
    }
    res.json({ success: true });
  });

  app.delete('/api/servers/:serverId/roles/:roleId', infra.requireAuth, async (req: AuthedRequest, res) => {
    const serverId = String(req.params.serverId);
    const roleId = String(req.params.roleId);
    const perms = await infra.getServerPermissionBits(req.user!.id, serverId);
    if (!infra.hasPerm(perms, infra.PERM.MANAGE_ROLES)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    await sql`delete from roles where id = ${roleId} and server_id = ${serverId}`;
    await infra.publishRealtime(`server:${serverId}`, 'server:role_deleted', { roleId });
    res.json({ success: true });
  });

  app.post('/api/servers/:serverId/roles/reorder', infra.requireAuth, async (req: AuthedRequest, res) => {
    const serverId = String(req.params.serverId);
    const perms = await infra.getServerPermissionBits(req.user!.id, serverId);
    if (!infra.hasPerm(perms, infra.PERM.MANAGE_ROLES)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const body = req.body as { roleIds?: string[] };
    const roleIds = Array.isArray(body.roleIds) ? body.roleIds : [];
    if (roleIds.length === 0) {
      res.status(400).json({ error: 'roleIds array is required' });
      return;
    }
    for (let i = 0; i < roleIds.length; i++) {
      await sql`
        update roles set position = ${roleIds.length - 1 - i}, updated_at = now()
        where id = ${roleIds[i]} and server_id = ${serverId}
      `;
    }
    await infra.publishRealtime(`server:${serverId}`, 'server:roles_reordered', { roleIds });
    res.json({ success: true });
  });

  app.get('/api/servers/:serverId/view', infra.requireAuth, async (req: AuthedRequest, res) => {
    const serverId = String(req.params.serverId);
    const userId = req.user!.id;
    if (!(await infra.ensureServerMember(res, userId, serverId))) return;

    const [serverRows, channelRows, roleRows, emojiRows, stickerRows, webhookRows] = await Promise.all([
      sql<{
        id: string; name: string; icon_url: string | null; description: string | null; owner_id: string;
        verification_level: string; system_channel_id: string | null; rules_channel_id: string | null;
        default_notification_channel_id: string | null; voice_region: string; media_scan_level: string;
        link_filter_enabled: boolean; bad_words_filter_level: string; custom_bad_words: string[] | null;
        is_community: boolean; announcements_channel_id: string | null; created_at: Date; updated_at: Date;
      }[]>`select * from servers where id = ${serverId} limit 1`,
      sql<{ id: string; server_id: string; name: string; type: string; position: number; parent_id: string | null; topic: string | null; slowmode: number; created_at: Date; updated_at: Date }[]>`
        select id, server_id, name, type, position, parent_id, topic, slowmode, created_at, updated_at
        from channels where server_id = ${serverId} order by position asc, created_at asc
      `,
      sql<{ id: string; server_id: string; name: string; color: string; position: number; permissions: number; created_at: Date; updated_at: Date }[]>`
        select id, server_id, name, color, position, permissions, created_at, updated_at
        from roles where server_id = ${serverId} order by position desc
      `,
      sql<{ id: string; server_id: string; name: string; url: string; created_by: string | null; created_at: Date }[]>`
        select id, server_id, name, url, created_by, created_at from server_emojis where server_id = ${serverId}
      `,
      sql<{ id: string; server_id: string; name: string; url: string; created_by: string | null; created_at: Date }[]>`
        select id, server_id, name, url, created_by, created_at from server_stickers where server_id = ${serverId}
      `,
      sql<{ id: string; server_id: string; channel_id: string; name: string; url: string; created_by: string | null; created_at: Date; updated_at: Date }[]>`
        select id, server_id, channel_id, name, url, created_by, created_at, updated_at from webhooks where server_id = ${serverId}
      `,
    ]);
    const srv = serverRows[0];
    if (!srv) {
      res.status(404).json({ error: 'Server not found' });
      return;
    }
    const channelIds = channelRows.map((c) => c.id);
    const channelBitsMap = channelIds.length > 0
      ? await infra.getChannelPermissionBitsForMany(userId, channelIds)
      : new Map<string, number>();
    const visibleChannels = channelRows.filter((c) => {
      const bits = channelBitsMap.get(c.id);
      return bits != null && infra.hasPerm(bits, infra.PERM.VIEW_CHANNEL);
    });
    const memberRows = await sql<{
      id: string; name: string; avatar_url: string | null; nickname: string | null; is_owner: boolean;
      role_id: string | null; role_name: string | null; role_color: string | null; role_position: number | null;
    }[]>`
      with members as (
        select u.id, u.name, u.avatar_url, (u.id = s.owner_id) as is_owner
        from users u inner join servers s on s.id = ${serverId}
        where u.id = s.owner_id
        union
        select u.id, u.name, u.avatar_url, false as is_owner
        from users u where exists (select 1 from user_roles ur where ur.server_id = ${serverId} and ur.user_id = u.id)
      )
      select m.id, m.name, m.avatar_url, sp.nickname, m.is_owner,
             r.id as role_id, r.name as role_name, r.color as role_color, r.position as role_position
      from members m
      left join server_profiles sp on sp.user_id = m.id and sp.server_id = ${serverId}
      left join user_roles ur on ur.user_id = m.id and ur.server_id = ${serverId}
      left join roles r on r.id = ur.role_id
      order by m.is_owner desc, m.name asc, r.position desc
    `;
    const membersPreviewMap = new Map<string, {
      id: string; userId: string; name: string; nickname: string | null; roles: Array<{ id: string; name: string; color: string; position: number }>; avatar: string | null; isOwner: boolean;
    }>();
    for (const row of memberRows) {
      if (!membersPreviewMap.has(row.id)) {
        membersPreviewMap.set(row.id, {
          id: row.id,
          userId: row.id,
          name: row.name,
          nickname: row.nickname,
          roles: [],
          avatar: row.avatar_url,
          isOwner: row.is_owner,
        });
      }
      if (row.role_id && row.role_name && row.role_color != null && row.role_position != null) {
        membersPreviewMap.get(row.id)!.roles.push({
          id: row.role_id,
          name: row.role_name,
          color: row.role_color,
          position: row.role_position,
        });
      }
    }
    const bits = await infra.getServerPermissionBits(userId, serverId);
    const canManageServer = infra.hasPerm(bits, infra.PERM.MANAGE_SERVER);
    res.json({
      server: {
        id: srv.id, name: srv.name, iconUrl: srv.icon_url, description: srv.description, ownerId: srv.owner_id,
        verificationLevel: srv.verification_level, systemChannelId: srv.system_channel_id, rulesChannelId: srv.rules_channel_id,
        defaultNotificationChannelId: srv.default_notification_channel_id, voiceRegion: srv.voice_region,
        mediaScanLevel: srv.media_scan_level, linkFilterEnabled: srv.link_filter_enabled, badWordsFilterLevel: srv.bad_words_filter_level,
        customBadWords: srv.custom_bad_words ?? [], isCommunity: srv.is_community, announcementsChannelId: srv.announcements_channel_id,
        createdAt: srv.created_at, updatedAt: srv.updated_at,
      },
      channels: visibleChannels.map((c) => ({
        id: c.id, serverId: c.server_id, name: c.name, type: c.type, position: c.position, parentId: c.parent_id, topic: c.topic, slowmode: c.slowmode, createdAt: c.created_at, updatedAt: c.updated_at,
      })),
      roles: roleRows.map((r) => ({
        id: r.id, serverId: r.server_id, name: r.name, color: r.color, position: r.position, permissions: r.permissions, createdAt: r.created_at, updatedAt: r.updated_at,
      })),
      emojis: emojiRows.map((e) => ({
        id: e.id, serverId: e.server_id, name: e.name, url: e.url, createdBy: e.created_by, createdAt: e.created_at,
      })),
      stickers: stickerRows.map((s) => ({
        id: s.id, serverId: s.server_id, name: s.name, url: s.url, createdBy: s.created_by, createdAt: s.created_at,
      })),
      webhooks: webhookRows.map((w) => ({
        id: w.id, serverId: w.server_id, channelId: w.channel_id, name: w.name, url: canManageServer ? w.url : null, createdBy: w.created_by, createdAt: w.created_at, updatedAt: w.updated_at,
      })),
      membersPreview: Array.from(membersPreviewMap.values()),
      currentUserPermissions: infra.toPermissionFlags(bits),
    });
  });

  app.post('/api/servers/:serverId/emojis', infra.requireAuth, async (req: AuthedRequest, res) => {
    const serverId = String(req.params.serverId);
    const perms = await infra.getServerPermissionBits(req.user!.id, serverId);
    if (!infra.hasPerm(perms, infra.PERM.MANAGE_SERVER) && !infra.hasPerm(perms, infra.PERM.MANAGE_ROLES)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const body = req.body as { name?: string; url?: string };
    if (!body.name || !body.url) {
      res.status(400).json({ error: 'name and url are required' });
      return;
    }
    await sql`
      insert into server_emojis (id, server_id, name, url, created_by, created_at)
      values (gen_random_uuid(), ${serverId}, ${body.name}, ${body.url}, ${req.user!.id}, now())
    `;
    res.status(201).json({ success: true });
  });

  app.delete('/api/servers/:serverId/emojis/:emojiId', infra.requireAuth, async (req: AuthedRequest, res) => {
    const serverId = String(req.params.serverId);
    const emojiId = String(req.params.emojiId);
    const perms = await infra.getServerPermissionBits(req.user!.id, serverId);
    if (!infra.hasPerm(perms, infra.PERM.MANAGE_SERVER) && !infra.hasPerm(perms, infra.PERM.MANAGE_ROLES)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    await sql`delete from server_emojis where id = ${emojiId} and server_id = ${serverId}`;
    res.json({ success: true });
  });

  app.post('/api/servers/:serverId/stickers', infra.requireAuth, async (req: AuthedRequest, res) => {
    const serverId = String(req.params.serverId);
    const perms = await infra.getServerPermissionBits(req.user!.id, serverId);
    if (!infra.hasPerm(perms, infra.PERM.MANAGE_SERVER) && !infra.hasPerm(perms, infra.PERM.MANAGE_ROLES)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const body = req.body as { name?: string; url?: string };
    if (!body.name || !body.url) {
      res.status(400).json({ error: 'name and url are required' });
      return;
    }
    await sql`
      insert into server_stickers (id, server_id, name, url, created_by, created_at)
      values (gen_random_uuid(), ${serverId}, ${body.name}, ${body.url}, ${req.user!.id}, now())
    `;
    res.status(201).json({ success: true });
  });

  app.delete('/api/servers/:serverId/webhooks/:webhookId', infra.requireAuth, async (req: AuthedRequest, res) => {
    const serverId = String(req.params.serverId);
    const webhookId = String(req.params.webhookId);
    const perms = await infra.getServerPermissionBits(req.user!.id, serverId);
    if (!infra.hasPerm(perms, infra.PERM.MANAGE_SERVER)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const deleted = await sql<{ id: string }[]>`
      delete from webhooks where id = ${webhookId} and server_id = ${serverId}
      returning id
    `;
    if (deleted.length === 0) {
      return res.status(404).json({ error: 'Webhook not found' });
    }
    setRevalidateTags(res, ['servers']);
    res.json({ success: true });
  });

  app.delete('/api/servers/:serverId/stickers/:stickerId', infra.requireAuth, async (req: AuthedRequest, res) => {
    const serverId = String(req.params.serverId);
    const stickerId = String(req.params.stickerId);
    const perms = await infra.getServerPermissionBits(req.user!.id, serverId);
    if (!infra.hasPerm(perms, infra.PERM.MANAGE_SERVER) && !infra.hasPerm(perms, infra.PERM.MANAGE_ROLES)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    await sql`delete from server_stickers where id = ${stickerId} and server_id = ${serverId}`;
    res.json({ success: true });
  });
}
