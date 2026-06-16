import type { RouteDeps } from './types.js';
import type { AuthedRequest } from '../infra.js';
import { emitNotification } from '../notifications/emit.js';

export function registerDmRoutes(deps: RouteDeps): void {
  const { app, sql, redis, infra } = deps;
  const emitDeps = { sql, redis, publishRealtime: infra.publishRealtime };

  app.get('/api/dms/channels', infra.requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const rows = await sql<{
      id: string;
      user1_id: string;
      user2_id: string;
      last_message_id: string | null;
      last_message_at: Date | null;
      created_at: Date;
      updated_at: Date;
      other_user_id: string;
      other_user_name: string;
      other_user_avatar_url: string | null;
    }[]>`
      select d.id, d.user1_id, d.user2_id, d.last_message_id, d.last_message_at, d.created_at, d.updated_at,
             case when d.user1_id = ${userId} then d.user2_id else d.user1_id end as other_user_id,
             u.name as other_user_name,
             u.avatar_url as other_user_avatar_url
      from dm_channels d
      inner join users u on u.id = case when d.user1_id = ${userId} then d.user2_id else d.user1_id end
      where d.user1_id = ${userId} or d.user2_id = ${userId}
      order by d.last_message_at desc nulls last, d.created_at desc
    `;
    const messageIds = rows.map((r) => r.last_message_id).filter(Boolean) as string[];
    type LastMessage = {
      id: string;
      content: string;
      created_at: Date;
      user_id: string;
      user_name: string;
      avatar_url: string | null;
    };
    const lastMessages: LastMessage[] = messageIds.length > 0
      ? await sql<LastMessage[]>`
          select m.id, m.content, m.created_at, m.user_id, u.name as user_name, u.avatar_url
          from messages m
          inner join users u on u.id = m.user_id
          where m.id in ${sql(messageIds)}
        `
      : [];
    const lastById = new Map<string, LastMessage>(lastMessages.map((m) => [m.id, m] as const));
    res.json({
      channels: rows.map((r) => {
        const lm = r.last_message_id ? lastById.get(r.last_message_id) : null;
        return {
          id: r.id,
          otherUser: {
            id: r.other_user_id,
            name: r.other_user_name,
            avatarUrl: r.other_user_avatar_url,
          },
          lastMessage: lm
            ? {
                id: lm.id,
                content: lm.content,
                createdAt: lm.created_at.toISOString(),
                userId: lm.user_id,
                user: { id: lm.user_id, name: lm.user_name, avatarUrl: lm.avatar_url },
              }
            : null,
          lastMessageAt: r.last_message_at ? r.last_message_at.toISOString() : null,
          createdAt: r.created_at.toISOString(),
          updatedAt: r.updated_at.toISOString(),
        };
      }),
    });
  });

  app.post('/api/dms/channels', infra.requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const otherUserId = (req.body as { userId?: string }).userId;
    if (!otherUserId || otherUserId === userId) {
      res.status(400).json({ error: 'Invalid userId' });
      return;
    }
    const [a, b] = [userId, otherUserId].sort();
    const created = await sql<{
      id: string;
      user1_id: string;
      user2_id: string;
      created_at: Date;
      updated_at: Date;
    }[]>`
      insert into dm_channels (id, user1_id, user2_id, created_at, updated_at)
      values (gen_random_uuid(), ${a}, ${b}, now(), now())
      on conflict (user1_id, user2_id) do update set updated_at = now()
      returning id, user1_id, user2_id, created_at, updated_at
    `;
    const channel = created[0];
    const users = await sql<{ id: string; name: string; avatar_url: string | null }[]>`
      select id, name, avatar_url from users where id in (${userId}, ${otherUserId})
    `;
    const other = users.find(u => u.id === otherUserId);
    const currentUser = users.find(u => u.id === userId);
    await infra.publishRealtime(`user:${otherUserId}`, 'dm:channel_created', {
      channel: {
        id: channel.id,
        otherUser: {
          id: currentUser?.id ?? userId,
          name: currentUser?.name ?? 'User',
          avatarUrl: currentUser?.avatar_url ?? null,
        },
      },
    });
    res.json({
      channel: {
        id: channel.id,
        otherUser: { id: other?.id ?? otherUserId, name: other?.name ?? 'User', avatarUrl: other?.avatar_url ?? null },
        lastMessage: null,
        lastMessageAt: null,
        createdAt: channel.created_at.toISOString(),
        updatedAt: channel.updated_at.toISOString(),
      },
    });
  });

  async function ensureDmMember(res: { status: (code: number) => { json: (body: object) => void } }, dmId: string, userId: string): Promise<boolean> {
    const rows = await sql<{ user1_id: string; user2_id: string }[]>`select user1_id, user2_id from dm_channels where id = ${dmId} limit 1`;
    if (!rows[0] || (rows[0].user1_id !== userId && rows[0].user2_id !== userId)) {
      res.status(403).json({ error: 'Forbidden' });
      return false;
    }
    return true;
  }

  async function publishDmCall(dmId: string, event: 'call_offer' | 'call_accept' | 'call_reject' | 'call_end', payload: Record<string, unknown>): Promise<void> {
    const enriched = { ...payload, channelId: dmId };
    await infra.publishRealtime(`dm:call:${dmId}`, event, enriched);
  }

  app.post('/api/dms/call/offer', infra.requireAuth, async (req: AuthedRequest, res) => {
    const body = req.body as { dmId?: string; fromUser?: unknown; callId?: string };
    if (!body.dmId) {
      res.status(400).json({ error: 'dmId is required' });
      return;
    }
    if (!(await ensureDmMember(res, body.dmId, req.user!.id))) return;
    const callerId = req.user!.id;
    const dmRows = await sql<{ user1_id: string; user2_id: string }[]>`
      select user1_id, user2_id from dm_channels where id = ${body.dmId} limit 1
    `;
    const dm = dmRows[0];
    if (dm) {
      const calleeId = dm.user1_id === callerId ? dm.user2_id : dm.user1_id;
      const callerRow = await sql<{ name: string }[]>`select name from users where id = ${callerId} limit 1`;
      await emitNotification(emitDeps, {
        userId: calleeId,
        type: 'call:incoming:dm',
        payload: {
          dmId: body.dmId,
          callId: body.callId ?? undefined,
          callerId,
          callerName: callerRow[0]?.name ?? 'User',
        },
        channelId: body.dmId,
        dmId: body.dmId,
        dedupKey: `call:dm:${body.dmId}:${callerId}`,
      });
    }
    await publishDmCall(body.dmId, 'call_offer', {
      dmId: body.dmId,
      fromUserId: callerId,
      fromUser: body.fromUser ?? null,
    });
    res.json({ success: true });
  });
  app.post('/api/dms/call/accept', infra.requireAuth, async (req: AuthedRequest, res) => {
    const body = req.body as { dmId?: string };
    if (!body.dmId) {
      res.status(400).json({ error: 'dmId is required' });
      return;
    }
    if (!(await ensureDmMember(res, body.dmId, req.user!.id))) return;
    await publishDmCall(body.dmId, 'call_accept', { dmId: body.dmId, fromUserId: req.user!.id });
    res.json({ success: true });
  });
  app.post('/api/dms/call/reject', infra.requireAuth, async (req: AuthedRequest, res) => {
    const body = req.body as { dmId?: string };
    if (!body.dmId) {
      res.status(400).json({ error: 'dmId is required' });
      return;
    }
    if (!(await ensureDmMember(res, body.dmId, req.user!.id))) return;
    await publishDmCall(body.dmId, 'call_reject', { dmId: body.dmId, fromUserId: req.user!.id });
    res.json({ success: true });
  });
  app.post('/api/dms/call/end', infra.requireAuth, async (req: AuthedRequest, res) => {
    const body = req.body as { dmId?: string };
    if (!body.dmId) {
      res.status(400).json({ error: 'dmId is required' });
      return;
    }
    if (!(await ensureDmMember(res, body.dmId, req.user!.id))) return;
    await publishDmCall(body.dmId, 'call_end', { dmId: body.dmId, fromUserId: req.user!.id });
    res.json({ success: true });
  });
}
