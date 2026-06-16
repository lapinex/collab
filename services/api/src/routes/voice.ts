import { AccessToken, WebhookReceiver } from 'livekit-server-sdk';
import type { RouteDeps } from './types.js';
import type { AuthedRequest } from '../infra.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function registerVoiceRoutes(deps: RouteDeps): void {
  const { app, sql, redis, infra } = deps;

  app.post('/api/livekit/webhook', async (req, res) => {
    try {
      const authHeader = req.get('authorization') ?? '';
      const rawBody =
        ((req as typeof req & { rawBody?: string }).rawBody ??
          JSON.stringify(req.body ?? {}));

      let event: unknown;
      if (authHeader) {
        if (!infra.LIVEKIT_API_KEY || !infra.LIVEKIT_WEBHOOK_KEY) {
          res.status(500).json({ error: 'LiveKit webhook verification is not configured' });
          return;
        }
        try {
          const receiver = new WebhookReceiver(
            infra.LIVEKIT_API_KEY,
            infra.LIVEKIT_WEBHOOK_KEY
          );
          event = await receiver.receive(rawBody, authHeader);
        } catch {
          res.status(401).json({ error: 'Invalid LiveKit webhook signature' });
          return;
        }
      } else if (req.body && typeof req.body === 'object') {
        // For local/dev testing where LiveKit signature may be disabled.
        event = req.body;
      } else {
        res.status(400).json({ error: 'Webhook payload is empty' });
        return;
      }

      const eventObject = event && typeof event === 'object' ? (event as Record<string, unknown>) : {};
      const eventName = String(eventObject.event ?? '');
      const room = (eventObject.room ?? null) as { name?: string } | null;
      const participant = (eventObject.participant ?? null) as { identity?: string } | null;
      const roomName = typeof room?.name === 'string' ? room.name : null;
      const userId = typeof participant?.identity === 'string' ? participant.identity : null;

      if (!roomName || !UUID_RE.test(roomName)) {
        res.json({ ok: true, ignored: true, reason: 'non-channel-room' });
        return;
      }

      if (eventName === 'participant_joined' && userId) {
        const users = await sql<{ id: string }[]>`
          select id from users where id = ${userId} limit 1
        `;
        if (!users[0]) {
          res.json({ ok: true, ignored: true, reason: 'unknown-user' });
          return;
        }

        await sql.begin(async (tx) => {
          const run = tx as unknown as typeof sql;
          await run`
            update voice_sessions
            set left_at = now()
            where user_id = ${userId} and left_at is null
          `;
          await run`
            insert into voice_sessions (id, user_id, channel_id, joined_at, left_at)
            values (gen_random_uuid(), ${userId}, ${roomName}, now(), null)
          `;
        });
        await infra.publishRealtime(`channel:${roomName}`, 'voice:joined', { userId, channelId: roomName });
      } else if (eventName === 'participant_left' && userId) {
        const rows = await sql<{ user_id: string }[]>`
          update voice_sessions
          set left_at = now()
          where user_id = ${userId} and channel_id = ${roomName} and left_at is null
          returning user_id
        `;
        if (rows.length > 0) {
          await infra.publishRealtime(`channel:${roomName}`, 'voice:left', { userId, channelId: roomName });
        }
      } else if (eventName === 'room_finished') {
        const rows = await sql<{ user_id: string }[]>`
          update voice_sessions
          set left_at = now()
          where channel_id = ${roomName} and left_at is null
          returning user_id
        `;
        for (const row of rows) {
          await infra.publishRealtime(`channel:${roomName}`, 'voice:left', {
            userId: row.user_id,
            channelId: roomName,
          });
        }
      }

      res.json({ ok: true });
    } catch (error) {
      console.error('[LiveKit webhook] Failed to process event', error);
      res.status(500).json({ error: 'Failed to process webhook' });
    }
  });

  app.post('/api/voice/join', infra.requireAuth, async (req: AuthedRequest, res) => {
    const channelId = String((req.body as { channelId?: string }).channelId ?? '').trim();
    if (!channelId) {
      res.status(400).json({ error: 'channelId is required' });
      return;
    }
    const userId = req.user!.id;
    const serverCh = await sql<{ server_id: string; type: string }[]>`select server_id, type from channels where id = ${channelId} limit 1`;
    if (serverCh[0]) {
      if (serverCh[0].type !== 'voice') {
        res.status(400).json({ error: 'Channel is not a voice channel' });
        return;
      }
      const bits = await infra.getChannelPermissionBits(userId, channelId);
      if (bits == null || !infra.hasPerm(bits, infra.PERM.VIEW_CHANNEL) || !infra.hasPerm(bits, infra.PERM.CONNECT)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    } else {
      const dm = await sql<{ user1_id: string; user2_id: string }[]>`select user1_id, user2_id from dm_channels where id = ${channelId} limit 1`;
      if (!dm[0] || (dm[0].user1_id !== userId && dm[0].user2_id !== userId)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    }
    await sql.begin(async (tx) => {
      const run = tx as unknown as typeof sql;
      await run`update voice_sessions set left_at = now() where user_id = ${userId} and left_at is null`;
      await run`
        insert into voice_sessions (id, user_id, channel_id, joined_at, left_at)
        values (gen_random_uuid(), ${userId}, ${channelId}, now(), null)
      `;
    });
    await infra.publishRealtime(`channel:${channelId}`, 'voice:joined', { userId, channelId });
    res.json({ success: true });
  });

  app.post('/api/voice/leave', infra.requireAuth, async (req: AuthedRequest, res) => {
    const channelId = String((req.body as { channelId?: string }).channelId ?? '').trim();
    const userId = req.user!.id;
    const rows = await sql<{ channel_id: string }[]>`
      update voice_sessions
      set left_at = now()
      where user_id = ${userId} and left_at is null
      returning channel_id
    `;
    const lastChannelId = channelId || rows[0]?.channel_id;
    if (lastChannelId) {
      await infra.publishRealtime(`channel:${lastChannelId}`, 'voice:left', { userId, channelId: lastChannelId });
    }
    res.json({ success: true });
  });

  app.get('/api/voice/participants', infra.requireAuth, async (req: AuthedRequest, res) => {
    const channelId = String(req.query.channelId ?? '').trim();
    if (!channelId) {
      res.status(400).json({ error: 'channelId is required' });
      return;
    }
    const userId = req.user!.id;
    const serverCh = await sql<{ server_id: string }[]>`select server_id from channels where id = ${channelId} limit 1`;
    if (serverCh[0]) {
      const bits = await infra.getChannelPermissionBits(userId, channelId);
      if (bits == null || !infra.hasPerm(bits, infra.PERM.VIEW_CHANNEL)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    } else {
      const dm = await sql<{ user1_id: string; user2_id: string }[]>`select user1_id, user2_id from dm_channels where id = ${channelId} limit 1`;
      if (!dm[0] || (dm[0].user1_id !== userId && dm[0].user2_id !== userId)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    }
    const rows = await sql<{
      user_id: string;
      user_name: string;
      avatar_url: string | null;
      joined_at: Date;
    }[]>`
      select vs.user_id, u.name as user_name, u.avatar_url, min(vs.joined_at) as joined_at
      from voice_sessions vs
      inner join users u on u.id = vs.user_id
      where vs.channel_id = ${channelId} and vs.left_at is null
      group by vs.user_id, u.name, u.avatar_url
      order by joined_at asc
    `;
    res.json({
      participants: rows.map((r) => ({
        userId: r.user_id,
        userName: r.user_name,
        avatarUrl: r.avatar_url,
        joinedAt: r.joined_at.toISOString(),
      })),
    });
  });

  app.post('/api/voice/moderation', infra.requireAuth, async (req: AuthedRequest, res) => {
    const body = req.body as { targetUserId?: string; channelId?: string; action?: 'mute' | 'unmute' | 'deafen' | 'undeafen' };
    if (!body.targetUserId || !body.channelId || !body.action) {
      res.status(400).json({ error: 'targetUserId, channelId, action are required' });
      return;
    }
    const c = await sql<{ server_id: string }[]>`select server_id from channels where id = ${body.channelId} limit 1`;
    if (!c[0]) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }
    const bits = await infra.getServerPermissionBits(req.user!.id, c[0].server_id);
    const allowed = body.action === 'mute' || body.action === 'unmute'
      ? infra.hasPerm(bits, infra.PERM.MUTE_MEMBERS)
      : infra.hasPerm(bits, infra.PERM.DEAFEN_MEMBERS);
    if (!allowed) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const muted = body.action === 'mute' ? true : body.action === 'unmute' ? false : undefined;
    const deafened = body.action === 'deafen' ? true : body.action === 'undeafen' ? false : undefined;
    await infra.publishRealtime(`channel:${body.channelId}`, 'participant_moderated', {
      userId: body.targetUserId,
      channelId: body.channelId,
      muted,
      deafened,
      actorUserId: req.user!.id,
    });
    res.json({ success: true });
  });

  app.post('/api/voice/signaling', infra.requireAuth, async (req: AuthedRequest, res) => {
    const body = req.body as { type?: 'offer' | 'answer'; offer?: unknown; answer?: unknown; channelId?: string; targetUserId?: string };
    if (!body.type || !body.channelId || !body.targetUserId) {
      res.status(400).json({ error: 'type, channelId, targetUserId are required' });
      return;
    }
    const sourceUserId = req.user!.id;
    const payload = body.type === 'offer' ? body.offer : body.answer;
    const key = `webrtc:${body.type}:${body.channelId}:${sourceUserId}:${body.targetUserId}`;
    await redis.setex(key, 30, JSON.stringify(payload ?? null));
    res.json({ success: true });
  });

  app.get('/api/voice/signaling/check', infra.requireAuth, async (req: AuthedRequest, res) => {
    const key = String(req.query.key ?? '').trim();
    if (!key) {
      res.status(400).json({ error: 'key is required' });
      return;
    }
    const parts = key.split(':');
    const type = parts[1];
    const validType = type === 'offer' || type === 'answer' || type === 'ice';
    const validLength = (type === 'ice' && parts.length === 6) || (type !== 'ice' && parts.length === 5);
    if (parts[0] !== 'webrtc' || !validType || !validLength) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const sourceUserId = parts[3];
    const targetUserId = parts[4];
    if (req.user!.id !== sourceUserId && req.user!.id !== targetUserId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const data = await redis.get(key);
    if (!data) {
      res.json({});
      return;
    }
    await redis.del(key);
    const parsed = JSON.parse(data) as unknown;
    if (key.includes(':offer:')) {
      res.json({ offer: parsed });
      return;
    }
    if (key.includes(':answer:')) {
      res.json({ answer: parsed });
      return;
    }
    res.json({ data: parsed });
  });

  app.post('/api/voice/ice-candidate', infra.requireAuth, async (req: AuthedRequest, res) => {
    const body = req.body as { candidate?: unknown; channelId?: string; targetUserId?: string };
    if (!body.channelId || !body.targetUserId) {
      res.status(400).json({ error: 'channelId and targetUserId are required' });
      return;
    }
    const sourceUserId = req.user!.id;
    const key = `webrtc:ice:${body.channelId}:${sourceUserId}:${body.targetUserId}:${Date.now()}`;
    await redis.setex(key, 30, JSON.stringify(body.candidate ?? null));
    res.json({ success: true });
  });

  app.post('/api/livekit/token', infra.requireAuth, async (req: AuthedRequest, res) => {
    if (!infra.LIVEKIT_URL || !infra.LIVEKIT_API_KEY || !infra.LIVEKIT_API_SECRET) {
      res.status(500).json({ error: 'LiveKit env is not configured' });
      return;
    }
    const userId = req.user!.id;
    const body = req.body as { channelId?: string; roomType?: 'dm' | 'channel'; dmId?: string };
    let roomName: string | null = null;
    let serverId: string | null = null;
    if (body.roomType === 'dm' && body.dmId) {
      roomName = `dm-${body.dmId}`;
    } else if (body.channelId) {
      roomName = body.channelId;
      const ch = await sql<{ server_id: string }[]>`select server_id from channels where id = ${body.channelId} limit 1`;
      serverId = ch[0]?.server_id ?? null;
    }
    if (!roomName) {
      res.status(400).json({ error: 'channelId or dmId is required' });
      return;
    }
    const at = new AccessToken(infra.LIVEKIT_API_KEY, infra.LIVEKIT_API_SECRET, {
      identity: userId,
      ttl: '15m',
      name: req.user?.name ?? req.user?.email ?? userId,
      metadata: JSON.stringify({ userId }),
    });
    at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
    const token = await at.toJwt();
    res.json({ token, url: infra.LIVEKIT_URL, channelId: body.channelId ?? null, serverId, canSpeak: true });
  });

  app.post('/api/livekit/cleanup', infra.requireAuth, async (_req: AuthedRequest, res) => {
    res.json({ success: true, roomsClosed: 0 });
  });
}
