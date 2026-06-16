import type { RouteDeps } from './types.js';
import type { AuthedRequest } from '../infra.js';

type CommandName = 'ban' | 'kick' | 'mute' | 'unmute' | 'timeout' | 'untimeout';

function parseUserArg(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const mentionMatch = value.match(/^<@!?([a-f0-9-]{36})>$/i);
  if (mentionMatch?.[1]) return mentionMatch[1];
  if (/^[a-f0-9-]{36}$/i.test(value)) return value;
  return null;
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

async function executeBanOrKick(
  deps: RouteDeps,
  actorId: string,
  serverId: string,
  targetUserId: string,
  action: 'ban' | 'kick'
): Promise<{ ok: boolean; error?: string }> {
  const { sql, infra } = deps;
  if (targetUserId === actorId) return { ok: false, error: 'You cannot moderate yourself' };

  const perms = await infra.getServerPermissionBits(actorId, serverId);
  const required = action === 'ban' ? infra.PERM.BAN_MEMBERS : infra.PERM.KICK_MEMBERS;
  if (!infra.hasPerm(perms, required)) return { ok: false, error: 'Forbidden' };

  const actorPos = await getMemberMaxRolePosition(sql, serverId, actorId);
  const targetPos = await getMemberMaxRolePosition(sql, serverId, targetUserId);
  if (actorPos <= targetPos) return { ok: false, error: 'Cannot moderate member with equal or higher role' };

  if (action === 'ban') {
    await sql`
      insert into banned_members (id, server_id, user_id, banned_by, reason, created_at)
      values (gen_random_uuid(), ${serverId}, ${targetUserId}, ${actorId}, null, now())
      on conflict (server_id, user_id) do update set banned_by = excluded.banned_by, created_at = now()
    `;
  }
  await sql`delete from user_roles where user_id = ${targetUserId} and server_id = ${serverId}`;
  await infra.publishRealtime(`user:${targetUserId}`, action === 'ban' ? 'server:banned' : 'server:kicked', { serverId });
  await infra.publishRealtime(`server:${serverId}`, 'server:member_removed', {
    userId: targetUserId,
    reason: action === 'ban' ? 'banned' : 'kicked',
  });
  return { ok: true };
}

export function registerCommandRoutes(deps: RouteDeps): void {
  const { app, sql, infra } = deps;

  app.get('/api/commands', infra.requireAuth, async (req: AuthedRequest, res) => {
    const serverId = String(req.query.serverId ?? '').trim();
    const query = String(req.query.q ?? '').trim().toLowerCase();
    if (!serverId) {
      res.status(400).json({ error: 'serverId is required' });
      return;
    }
    if (!(await infra.ensureServerMember(res, req.user!.id, serverId))) return;

    const perms = await infra.getServerPermissionBits(req.user!.id, serverId);
    const commands = [
      { name: '/ban', description: 'Ban member from server', enabled: infra.hasPerm(perms, infra.PERM.BAN_MEMBERS) },
      { name: '/kick', description: 'Kick member from server', enabled: infra.hasPerm(perms, infra.PERM.KICK_MEMBERS) },
      { name: '/mute', description: 'Mute member (moderation marker)', enabled: infra.hasPerm(perms, infra.PERM.MANAGE_MEMBERS) },
      { name: '/unmute', description: 'Unmute member', enabled: infra.hasPerm(perms, infra.PERM.MANAGE_MEMBERS) },
      { name: '/timeout', description: 'Set timeout marker for member', enabled: infra.hasPerm(perms, infra.PERM.MANAGE_MEMBERS) },
      { name: '/untimeout', description: 'Remove timeout marker for member', enabled: infra.hasPerm(perms, infra.PERM.MANAGE_MEMBERS) },
    ].filter((c) => c.enabled && (!query || c.name.includes(query)));

    res.json({ commands });
  });

  app.post('/api/commands/execute', infra.requireAuth, async (req: AuthedRequest, res) => {
    const body = req.body as { serverId?: string; command?: string };
    const serverId = String(body.serverId ?? '').trim();
    const command = String(body.command ?? '').trim();
    if (!serverId || !command.startsWith('/')) {
      res.status(400).json({ error: 'serverId and slash command are required' });
      return;
    }
    if (!(await infra.ensureServerMember(res, req.user!.id, serverId))) return;

    const [rawName, rawUserArg] = command.split(/\s+/, 2);
    const name = rawName.slice(1).toLowerCase() as CommandName;
    const targetUserId = rawUserArg ? parseUserArg(rawUserArg) : null;

    if (!targetUserId) {
      res.status(400).json({ error: 'Command requires target user id or mention' });
      return;
    }

    if (name === 'ban' || name === 'kick') {
      const result = await executeBanOrKick(deps, req.user!.id, serverId, targetUserId, name);
      if (!result.ok) {
        res.status(403).json({ error: result.error ?? 'Command failed' });
        return;
      }
      res.json({ success: true, executed: name, targetUserId });
      return;
    }

    if (name === 'mute' || name === 'unmute' || name === 'timeout' || name === 'untimeout') {
      const perms = await infra.getServerPermissionBits(req.user!.id, serverId);
      if (!infra.hasPerm(perms, infra.PERM.MANAGE_MEMBERS)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      await sql`
        insert into server_audit_logs (id, server_id, actor_id, action, target_type, target_id, meta, created_at)
        values (
          gen_random_uuid(),
          ${serverId},
          ${req.user!.id},
          ${name},
          'user',
          ${targetUserId},
          ${JSON.stringify({ source: 'slash-command' })}::jsonb,
          now()
        )
      `;
      await infra.publishRealtime(`user:${targetUserId}`, `server:${name}` as 'server:kicked', { serverId, actorId: req.user!.id });
      res.json({ success: true, executed: name, targetUserId });
      return;
    }

    res.status(400).json({ error: 'Unknown command' });
  });
}
