import crypto from 'node:crypto';
import type { RouteDeps } from './types.js';
import type { AuthedRequest } from '../infra.js';

export function registerInviteRoutes(deps: RouteDeps): void {
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

  app.post('/api/servers/join', infra.requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const body = req.body as { code?: string; inviteCode?: string };
    const code = String(body.code ?? body.inviteCode ?? '').trim();
    if (!code) {
      res.status(400).json({ error: 'code or inviteCode is required' });
      return;
    }
    const inviteRows = await sql<{
      id: string; server_id: string; max_uses: number | null; uses: number; expires_at: Date | null;
    }[]>`
      select id, server_id, max_uses, uses, expires_at from server_invitations where code = ${code} limit 1
    `;
    const invite = inviteRows[0];
    if (!invite) {
      res.status(404).json({ error: 'Invite not found' });
      return;
    }
    if (invite.expires_at && invite.expires_at.getTime() < Date.now()) {
      res.status(410).json({ error: 'Invite expired' });
      return;
    }
    if (invite.max_uses != null && invite.uses >= invite.max_uses) {
      res.status(410).json({ error: 'Invite exhausted' });
      return;
    }
    const banned = await sql<{ id: string }[]>`
      select id from banned_members where server_id = ${invite.server_id} and user_id = ${userId} limit 1
    `;
    if (banned[0]) {
      res.status(403).json({ error: 'You are banned from this server' });
      return;
    }
    // Explicit @everyone/default role for join (P0): do not use "order by position limit 1"
    const everyoneRole = await sql<{ id: string }[]>`
      select id from roles where server_id = ${invite.server_id} and (name = '@everyone' or position = 0) limit 1
    `;
    let roleIdToAssign: string | null = everyoneRole[0]?.id ?? null;
    if (!roleIdToAssign) {
      const created = await sql<{ id: string }[]>`
        insert into roles (id, server_id, name, color, position, permissions, created_at, updated_at)
        values (gen_random_uuid(), ${invite.server_id}, '@everyone', '#99aab5', 0, ${infra.defaultMemberPermissions()}, now(), now())
        returning id
      `;
      roleIdToAssign = created[0]?.id ?? null;
    }
    if (roleIdToAssign) {
      await sql`
        insert into user_roles (user_id, role_id, server_id)
        values (${userId}, ${roleIdToAssign}, ${invite.server_id})
        on conflict do nothing
      `;
    }
    await sql`update server_invitations set uses = uses + 1 where id = ${invite.id}`;
    await sql`
      insert into server_invite_uses (id, invite_id, user_id, used_at)
      values (gen_random_uuid(), ${invite.id}, ${userId}, now())
    `;
    await sql`
      insert into invite_audit_log (id, server_id, invite_id, action, user_id, created_at)
      values (gen_random_uuid(), ${invite.server_id}, ${invite.id}, 'used', ${userId}, now())
    `;
    const serverRow = await sql<{ name: string }[]>`select name from servers where id = ${invite.server_id} limit 1`;
    const serverName = serverRow[0]?.name;
    const userData = await sql<{ id: string; name: string; avatar_url: string | null }[]>`
      select id, name, avatar_url from users where id = ${userId} limit 1
    `;
    await infra.publishRealtime(`server:${invite.server_id}`, 'server:member_joined', {
      user: {
        id: userData[0]?.id ?? userId,
        name: userData[0]?.name ?? 'User',
        avatarUrl: userData[0]?.avatar_url ?? null,
      },
    });
    await publishServerMemberEvent(invite.server_id, 'server:member_joined', {
      serverId: invite.server_id,
      user: {
        id: userData[0]?.id ?? userId,
        name: userData[0]?.name ?? 'User',
        avatarUrl: userData[0]?.avatar_url ?? null,
      },
    });
    res.json({
      success: true,
      serverId: invite.server_id,
      ...(serverName && { server: { id: invite.server_id, name: serverName } }),
    });
  });

  app.get('/api/invites', infra.requireAuth, async (req: AuthedRequest, res) => {
    const serverId = typeof req.query.serverId === 'string' ? req.query.serverId : null;
    if (!serverId) {
      res.status(400).json({ error: 'serverId is required' });
      return;
    }
    if (!(await infra.ensureServerMember(res, req.user!.id, serverId))) return;
    const rows = await sql<{
      id: string; code: string; server_id: string; created_by: string; creator_name: string | null;
      expires_at: Date | null; max_uses: number | null; uses: number; created_at: Date;
    }[]>`
      select i.id, i.code, i.server_id, i.created_by, u.name as creator_name, i.expires_at, i.max_uses, i.uses, i.created_at
      from server_invitations i
      left join users u on u.id = i.created_by
      where i.server_id = ${serverId}
      order by i.created_at desc
    `;
    res.json({
      invitations: rows.map((r) => ({
        id: r.id, code: r.code, serverId: r.server_id, createdBy: r.created_by, creatorName: r.creator_name,
        expiresAt: r.expires_at ? r.expires_at.toISOString() : null, maxUses: r.max_uses, uses: r.uses, createdAt: r.created_at.toISOString(),
      })),
    });
  });

  app.post('/api/invites', infra.requireAuth, async (req: AuthedRequest, res) => {
    const serverId = String((req.body as { serverId?: string }).serverId ?? '').trim();
    if (!serverId) {
      res.status(400).json({ error: 'serverId is required' });
      return;
    }
    const perms = await infra.getServerPermissionBits(req.user!.id, serverId);
    if (!infra.hasPerm(perms, infra.PERM.CREATE_INVITES)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const code = crypto.randomBytes(4).toString('hex');
    const rows = await sql<{ id: string; code: string; created_at: Date }[]>`
      insert into server_invitations (id, server_id, code, created_by, expires_at, max_uses, uses, created_at)
      values (gen_random_uuid(), ${serverId}, ${code}, ${req.user!.id}, null, null, 0, now())
      returning id, code, created_at
    `;
    await sql`
      insert into invite_audit_log (id, server_id, invite_id, action, user_id, created_at)
      values (gen_random_uuid(), ${serverId}, ${rows[0].id}, 'created', ${req.user!.id}, now())
    `;
    res.status(201).json({
      id: rows[0].id,
      code: rows[0].code,
      serverId,
      expiresAt: null,
      maxUses: null,
      uses: 0,
      createdAt: rows[0].created_at.toISOString(),
    });
  });

  app.delete('/api/invites/:inviteId', infra.requireAuth, async (req: AuthedRequest, res) => {
    const inv = await sql<{ server_id: string }[]>`select server_id from server_invitations where id = ${req.params.inviteId} limit 1`;
    if (!inv[0]) {
      res.status(404).json({ error: 'Invite not found' });
      return;
    }
    const perms = await infra.getServerPermissionBits(req.user!.id, inv[0].server_id);
    if (!infra.hasPerm(perms, infra.PERM.MANAGE_INVITES)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    await sql`
      insert into invite_audit_log (id, server_id, invite_id, action, user_id, created_at)
      values (gen_random_uuid(), ${inv[0].server_id}, ${req.params.inviteId}, 'deleted', ${req.user!.id}, now())
    `;
    await sql`delete from server_invitations where id = ${req.params.inviteId}`;
    res.json({ success: true });
  });

  app.get('/api/servers/:serverId/audit-log/invites', infra.requireAuth, async (req: AuthedRequest, res) => {
    const serverId = String((req.params.serverId ?? '')).trim();
    if (!serverId) {
      res.status(400).json({ error: 'serverId is required' });
      return;
    }
    if (!(await infra.ensureServerMember(res, req.user!.id, serverId))) return;
    const perms = await infra.getServerPermissionBits(req.user!.id, serverId);
    if (!infra.hasPerm(perms, infra.PERM.VIEW_AUDIT_LOG)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const rows = await sql<{
      id: string;
      server_id: string;
      invite_id: string | null;
      action: string;
      user_id: string;
      created_at: Date;
    }[]>`
      select id, server_id, invite_id, action, user_id, created_at
      from invite_audit_log
      where server_id = ${serverId}
      order by created_at desc
      limit 100
    `;
    res.json({
      entries: rows.map((r) => ({
        id: r.id,
        serverId: r.server_id,
        inviteId: r.invite_id,
        action: r.action,
        userId: r.user_id,
        createdAt: r.created_at.toISOString(),
      })),
    });
  });
}
