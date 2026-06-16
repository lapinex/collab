import express from 'express';
import type { RouteDeps } from './types.js';
import type { AuthedRequest } from '../infra.js';
import { emitNotification } from '../notifications/emit.js';

export function registerFriendRoutes(deps: RouteDeps): void {
  const { app, sql, redis, infra } = deps;
  const emitDeps = { sql, redis, publishRealtime: infra.publishRealtime };

  app.get('/api/friends', infra.requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const rows = await sql<{
      id: string;
      name: string;
      avatar_url: string | null;
      status: string | null;
    }[]>`
      select u.id, u.name, u.avatar_url, p.status
      from friends f
      inner join users u on u.id = f.friend_id
      left join presence p on p.user_id = u.id
      where f.user_id = ${userId}
      order by u.name asc
    `;
    res.json({
      friends: rows.map((r) => ({
        id: r.id,
        username: r.name,
        avatar: r.avatar_url,
        status: (r.status ?? 'offline') as 'online' | 'offline' | 'idle' | 'dnd',
      })),
    });
  });

  app.get('/api/friends/requests', infra.requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const incoming = await sql<{
      id: string;
      from_user_id: string;
      to_user_id: string;
      status: string;
      created_at: Date;
      from_name: string;
      from_avatar_url: string | null;
    }[]>`
      select fr.id, fr.from_user_id, fr.to_user_id, fr.status, fr.created_at, u.name as from_name, u.avatar_url as from_avatar_url
      from friend_requests fr
      inner join users u on u.id = fr.from_user_id
      where fr.to_user_id = ${userId} and fr.status = 'pending'
      order by fr.created_at desc
    `;
    const outgoing = await sql<{
      id: string;
      from_user_id: string;
      to_user_id: string;
      status: string;
      created_at: Date;
      to_name: string;
      to_avatar_url: string | null;
    }[]>`
      select fr.id, fr.from_user_id, fr.to_user_id, fr.status, fr.created_at, u.name as to_name, u.avatar_url as to_avatar_url
      from friend_requests fr
      inner join users u on u.id = fr.to_user_id
      where fr.from_user_id = ${userId} and fr.status = 'pending'
      order by fr.created_at desc
    `;
    res.json({
      incoming: incoming.map((r) => ({
        id: r.id,
        fromUserId: r.from_user_id,
        toUserId: r.to_user_id,
        status: r.status,
        createdAt: r.created_at.toISOString(),
        fromUser: { id: r.from_user_id, name: r.from_name, avatarUrl: r.from_avatar_url },
      })),
      outgoing: outgoing.map((r) => ({
        id: r.id,
        fromUserId: r.from_user_id,
        toUserId: r.to_user_id,
        status: r.status,
        createdAt: r.created_at.toISOString(),
        toUser: { id: r.to_user_id, name: r.to_name, avatarUrl: r.to_avatar_url },
      })),
    });
  });

  app.post('/api/friends/requests', infra.requireAuth, async (req: AuthedRequest, res) => {
    const fromUserId = req.user!.id;
    const toUserId = (req.body as { toUserId?: string; userId?: string }).toUserId ?? (req.body as { userId?: string }).userId;
    if (!toUserId || toUserId === fromUserId) {
      res.status(400).json({ error: 'Invalid target user' });
      return;
    }
    try {
      const inserted = await sql<{ id: string }[]>`
        insert into friend_requests (id, from_user_id, to_user_id, status, created_at, updated_at)
        values (gen_random_uuid(), ${fromUserId}, ${toUserId}, 'pending', now(), now())
        on conflict (from_user_id, to_user_id) do update set status = 'pending', updated_at = now()
        returning id
      `;
      const fromUser = await sql<{ id: string; name: string; avatar_url: string | null }[]>`
        select id, name, avatar_url from users where id = ${fromUserId} limit 1
      `;
      const requestId = inserted[0]?.id;
      await emitNotification(emitDeps, {
        userId: toUserId,
        type: 'friend:request',
        payload: {
          requestId: requestId ?? '',
          fromUserId,
          fromUserName: fromUser[0]?.name ?? 'User',
        },
        dedupKey: `fr:${fromUserId}:${toUserId}`,
      });
      await infra.publishRealtime(`user:${toUserId}`, 'friend:request_received', {
        requestId,
        fromUser: {
          id: fromUser[0]?.id ?? fromUserId,
          name: fromUser[0]?.name ?? 'User',
          avatarUrl: fromUser[0]?.avatar_url ?? null,
        },
      });
      res.status(201).json({ success: true });
    } catch {
      res.status(500).json({ error: 'Failed to create request' });
    }
  });

  async function resolveFriendRequestAction(
    req: AuthedRequest,
    res: express.Response,
    action: 'accept' | 'decline' | 'cancel'
  ): Promise<void> {
    const userId = req.user!.id;
    const requestId = req.params.requestId;
    const rows = await sql<{
      id: string;
      from_user_id: string;
      to_user_id: string;
      status: string;
    }[]>`
      select id, from_user_id, to_user_id, status from friend_requests where id = ${requestId} limit 1
    `;
    const fr = rows[0];
    if (!fr) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    if (action === 'accept') {
      if (fr.to_user_id !== userId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      await sql`update friend_requests set status = 'accepted', updated_at = now() where id = ${requestId}`;
      await sql`
        insert into friends (user_id, friend_id, created_at)
        values (${fr.from_user_id}, ${fr.to_user_id}, now())
        on conflict do nothing
      `;
      await sql`
        insert into friends (user_id, friend_id, created_at)
        values (${fr.to_user_id}, ${fr.from_user_id}, now())
        on conflict do nothing
      `;
      const users = await sql<{ id: string; name: string; avatar_url: string | null }[]>`
        select id, name, avatar_url from users where id in (${fr.from_user_id}, ${fr.to_user_id})
      `;
      const fromUserData = users.find(u => u.id === fr.from_user_id);
      const toUserData = users.find(u => u.id === fr.to_user_id);
      await emitNotification(emitDeps, {
        userId: fr.from_user_id,
        type: 'friend:accepted',
        payload: {
          userId: fr.to_user_id,
          userName: toUserData?.name ?? 'User',
        },
        dedupKey: `friend:accepted:${fr.from_user_id}:${fr.to_user_id}`,
      });
      await infra.publishRealtime(`user:${fr.from_user_id}`, 'friend:added', {
        friend: {
          id: toUserData?.id ?? fr.to_user_id,
          name: toUserData?.name ?? 'User',
          avatarUrl: toUserData?.avatar_url ?? null,
        },
      });
      await infra.publishRealtime(`user:${fr.to_user_id}`, 'friend:added', {
        friend: {
          id: fromUserData?.id ?? fr.from_user_id,
          name: fromUserData?.name ?? 'User',
          avatarUrl: fromUserData?.avatar_url ?? null,
        },
      });
      res.json({ success: true });
      return;
    }
    if (action === 'decline') {
      if (fr.to_user_id !== userId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      await sql`update friend_requests set status = 'declined', updated_at = now() where id = ${requestId}`;
      await infra.publishRealtime(`user:${fr.from_user_id}`, 'friend:request_declined', {
        requestId: fr.id,
        userId: fr.to_user_id,
      });
      res.json({ success: true });
      return;
    }
    if (fr.from_user_id !== userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    await sql`update friend_requests set status = 'canceled', updated_at = now() where id = ${requestId}`;
    await infra.publishRealtime(`user:${fr.to_user_id}`, 'friend:request_cancelled', {
      requestId: fr.id,
      userId: fr.from_user_id,
    });
    res.json({ success: true });
  }

  app.post('/api/friends/requests/:requestId/accept', infra.requireAuth, async (req: AuthedRequest, res) => {
    await resolveFriendRequestAction(req, res, 'accept');
  });
  app.post('/api/friends/requests/:requestId/decline', infra.requireAuth, async (req: AuthedRequest, res) => {
    await resolveFriendRequestAction(req, res, 'decline');
  });
  app.post('/api/friends/requests/:requestId/cancel', infra.requireAuth, async (req: AuthedRequest, res) => {
    await resolveFriendRequestAction(req, res, 'cancel');
  });

  app.delete('/api/friends/:friendId', infra.requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const friendId = req.params.friendId;
    await sql`delete from friends where (user_id = ${userId} and friend_id = ${friendId}) or (user_id = ${friendId} and friend_id = ${userId})`;
    await infra.publishRealtime(`user:${userId}`, 'friend:removed', { friendId });
    await infra.publishRealtime(`user:${friendId}`, 'friend:removed', { friendId: userId });
    res.json({ success: true });
  });
}
