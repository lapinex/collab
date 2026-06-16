import bcrypt from 'bcryptjs';
import type { RouteDeps } from './types.js';
import type { AuthedRequest } from '../infra.js';
import { USER_LIMITS } from '../constants.js';

export function registerUserRoutes(deps: RouteDeps): void {
  const { app, sql, infra } = deps;

  app.get('/api/users/settings', infra.requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const rows = await sql<{
      theme: string;
      language: string | null;
      location: string | null;
      auto_translate: boolean | null;
      preferred_language: string | null;
      notifications_enabled: boolean | null;
      notifications_sound: boolean | null;
      notifications_mentions: boolean | null;
      privacy_show_email: boolean | null;
      privacy_show_online_status: boolean | null;
    }[]>`
      select u.theme,
             s.language, s.location, s.auto_translate, s.preferred_language,
             s.notifications_enabled, s.notifications_sound, s.notifications_mentions,
             s.privacy_show_email, s.privacy_show_online_status
      from users u
      left join user_settings s on s.user_id = u.id
      where u.id = ${userId}
      limit 1
    `;
    const row = rows[0];
    res.json({
      theme: row?.theme ?? 'collab',
      settings: {
        language: row?.language ?? 'en',
        location: row?.location ?? null,
        autoTranslate: row?.auto_translate ?? false,
        preferredLanguage: row?.preferred_language ?? 'en',
        notificationsEnabled: row?.notifications_enabled ?? true,
        notificationsSound: row?.notifications_sound ?? true,
        notificationsMentions: row?.notifications_mentions ?? true,
        privacyShowEmail: row?.privacy_show_email ?? false,
        privacyShowOnlineStatus: row?.privacy_show_online_status ?? true,
      },
    });
  });

  app.patch('/api/users/settings', infra.requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const body = req.body as Record<string, unknown>;
    const theme = typeof body.theme === 'string' ? body.theme : null;
    if (theme) {
      await sql`update users set theme = ${theme}, updated_at = now() where id = ${userId}`;
    }
    await sql`
      insert into user_settings (
        user_id, language, location, auto_translate, preferred_language,
        notifications_enabled, notifications_sound, notifications_mentions,
        privacy_show_email, privacy_show_online_status, updated_at, created_at
      ) values (
        ${userId},
        ${typeof body.language === 'string' ? body.language : 'en'},
        ${typeof body.location === 'string' ? body.location : null},
        ${typeof body.autoTranslate === 'boolean' ? body.autoTranslate : false},
        ${typeof body.preferredLanguage === 'string' ? body.preferredLanguage : 'en'},
        ${typeof body.notificationsEnabled === 'boolean' ? body.notificationsEnabled : true},
        ${typeof body.notificationsSound === 'boolean' ? body.notificationsSound : true},
        ${typeof body.notificationsMentions === 'boolean' ? body.notificationsMentions : true},
        ${typeof body.privacyShowEmail === 'boolean' ? body.privacyShowEmail : false},
        ${typeof body.privacyShowOnlineStatus === 'boolean' ? body.privacyShowOnlineStatus : true},
        now(),
        now()
      )
      on conflict (user_id) do update set
        language = excluded.language,
        location = excluded.location,
        auto_translate = excluded.auto_translate,
        preferred_language = excluded.preferred_language,
        notifications_enabled = excluded.notifications_enabled,
        notifications_sound = excluded.notifications_sound,
        notifications_mentions = excluded.notifications_mentions,
        privacy_show_email = excluded.privacy_show_email,
        privacy_show_online_status = excluded.privacy_show_online_status,
        updated_at = now()
    `;
    res.json({ success: true });
  });

  app.get('/api/users/me/settings', infra.requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const rows = await sql<{
      name: string;
      email: string;
      theme: string;
      notifications_enabled: boolean | null;
      notifications_mentions: boolean | null;
    }[]>`
      select u.name, u.email, u.theme,
             s.notifications_enabled, s.notifications_mentions
      from users u
      left join user_settings s on s.user_id = u.id
      where u.id = ${userId}
      limit 1
    `;
    const row = rows[0];
    const notificationsMode: 'all' | 'mentions' | 'none' =
      row?.notifications_mentions === false && row?.notifications_enabled === false
        ? 'none'
        : row?.notifications_mentions === true && row?.notifications_enabled !== false
          ? 'mentions'
          : 'all';
    res.json({
      username: row?.name ?? '',
      email: row?.email ?? '',
      user_settings: {
        allowDm: true,
        allowDmFromNonMutual: true,
        allowFriendRequests: true,
        notificationsMode,
        voiceInputDevice: null as string | null,
        voiceOutputDevice: null as string | null,
        voiceScreenShareSound: true,
      },
      current_session: null,
      sessions: [],
    });
  });

  app.patch('/api/users/me/settings', infra.requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const body = req.body as {
      allowDm?: boolean;
      allowDmFromNonMutual?: boolean;
      allowFriendRequests?: boolean;
      notificationsMode?: 'all' | 'mentions' | 'none';
      voiceInputDevice?: string | null;
      voiceOutputDevice?: string | null;
      voiceScreenShareSound?: boolean;
    };
    const mode = body.notificationsMode ?? 'all';
    const notificationsEnabled = mode !== 'none';
    const notificationsMentions = mode === 'mentions' || mode === 'all';
    await sql`
      insert into user_settings (
        user_id, language, location, auto_translate, preferred_language,
        notifications_enabled, notifications_sound, notifications_mentions,
        privacy_show_email, privacy_show_online_status, updated_at, created_at
      ) values (
        ${userId}, 'en', null, false, 'en',
        ${notificationsEnabled}, true, ${notificationsMentions},
        false, true, now(), now()
      )
      on conflict (user_id) do update set
        notifications_enabled = ${notificationsEnabled},
        notifications_mentions = ${notificationsMentions},
        updated_at = now()
    `;
    res.json({ success: true });
  });

  app.patch('/api/users/profile', infra.requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const body = req.body as { name?: string; bio?: string | null; avatarUrl?: string | null };
    await sql`
      update users
      set name = coalesce(${body.name ?? null}, name),
          bio = ${body.bio ?? null},
          avatar_url = ${body.avatarUrl ?? null},
          updated_at = now()
      where id = ${userId}
    `;
    const friendIds = await sql<{ friend_id: string }[]>`
      select friend_id from friends where user_id = ${userId}
    `;
    const updatedUser = await sql<{ id: string; name: string; avatar_url: string | null; bio: string | null }[]>`
      select id, name, avatar_url, bio from users where id = ${userId} limit 1
    `;
    if (updatedUser[0]) {
      for (const friend of friendIds) {
        await infra.publishRealtime(`user:${friend.friend_id}`, 'user:profile_updated', {
          user: {
            id: updatedUser[0].id,
            name: updatedUser[0].name,
            avatarUrl: updatedUser[0].avatar_url,
            bio: updatedUser[0].bio,
          },
        });
      }
    }
    res.json({ success: true });
  });

  app.get('/api/users/search', infra.requireAuth, async (req: AuthedRequest, res) => {
    const q = String(req.query.q ?? req.query.query ?? '').trim();
    if (!q) {
      res.json({ users: [] });
      return;
    }
    const rows = await sql<{ id: string; name: string; avatar_url: string | null }[]>`
      select id, name, avatar_url from users
      where lower(name) like ${`%${q.toLowerCase()}%`}
      order by name asc
      limit 20
    `;
    res.json({
      users: rows.map((u) => ({ id: u.id, name: u.name, username: u.name, avatarUrl: u.avatar_url })),
    });
  });

  app.get('/api/users/me/blocks', infra.requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const rows = await sql<{
      id: string;
      name: string;
      avatar_url: string | null;
    }[]>`
      select u.id, u.name, u.avatar_url
      from user_blocks b
      inner join users u on u.id = b.blocked_user_id
      where b.user_id = ${userId}
      order by u.name asc
    `;
    res.json({
      blocks: rows.map((r) => ({ id: r.id, user: { id: r.id, name: r.name, avatarUrl: r.avatar_url } })),
    });
  });

  app.post('/api/users/me/block', infra.requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const target = (req.body as { userId?: string }).userId;
    if (!target || target === userId) {
      res.status(400).json({ error: 'Invalid userId' });
      return;
    }
    await sql`
      insert into user_blocks (user_id, blocked_user_id)
      values (${userId}, ${target})
      on conflict do nothing
    `;
    await sql`delete from friends where (user_id = ${userId} and friend_id = ${target}) or (user_id = ${target} and friend_id = ${userId})`;
    res.json({ success: true });
  });

  app.delete('/api/users/me/block/:userId', infra.requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    await sql`delete from user_blocks where user_id = ${userId} and blocked_user_id = ${req.params.userId}`;
    res.json({ success: true });
  });

  app.post('/api/users/me/change-password', infra.requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const body = req.body as { currentPassword?: string; newPassword?: string };
    if (!body.currentPassword || !body.newPassword || body.newPassword.length < USER_LIMITS.MIN_PASSWORD_LENGTH) {
      res.status(400).json({ error: 'Invalid payload' });
      return;
    }
    const rows = await sql<{ password_hash: string }[]>`select password_hash from users where id = ${userId} limit 1`;
    const current = rows[0];
    if (!current || !(await bcrypt.compare(body.currentPassword, current.password_hash))) {
      res.status(400).json({ error: 'Current password is invalid' });
      return;
    }
    const hash = await bcrypt.hash(body.newPassword, 12);
    await sql`update users set password_hash = ${hash}, updated_at = now() where id = ${userId}`;
    res.json({ success: true });
  });

  app.get('/api/users/:userId/profile', infra.requireAuth, async (req: AuthedRequest, res) => {
    const currentUserId = req.user!.id;
    const targetUserId = req.params.userId;
    const serverId = typeof req.query.serverId === 'string' ? req.query.serverId : null;

    const users = await sql<{ id: string; name: string; avatar_url: string | null }[]>`
      select id, name, avatar_url from users where id = ${targetUserId} limit 1
    `;
    const user = users[0];
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const [presence, isFriend, incomingReq, outgoingReq, isBlocked] = await Promise.all([
      sql<{ status: string }[]>`select status from presence where user_id = ${targetUserId} limit 1`,
      sql<{ ok: number }[]>`select 1 as ok from friends where user_id = ${currentUserId} and friend_id = ${targetUserId} limit 1`,
      sql<{ id: string }[]>`select id from friend_requests where from_user_id = ${targetUserId} and to_user_id = ${currentUserId} and status = 'pending' limit 1`,
      sql<{ id: string }[]>`select id from friend_requests where from_user_id = ${currentUserId} and to_user_id = ${targetUserId} and status = 'pending' limit 1`,
      sql<{ ok: number }[]>`select 1 as ok from user_blocks where (user_id = ${currentUserId} and blocked_user_id = ${targetUserId}) or (user_id = ${targetUserId} and blocked_user_id = ${currentUserId}) limit 1`,
    ]);

    let rolesInServer: Array<{ roleId: string; roleName: string; roleColor: string | null; position: number }> = [];
    let serverNickname: string | null = null;
    if (serverId) {
      const roleRows = await sql<{ role_id: string; role_name: string; role_color: string | null; position: number }[]>`
        select r.id as role_id, r.name as role_name, r.color as role_color, r.position
        from user_roles ur
        inner join roles r on r.id = ur.role_id
        where ur.user_id = ${targetUserId} and ur.server_id = ${serverId}
        order by r.position desc
      `;
      rolesInServer = roleRows.map((r) => ({
        roleId: r.role_id,
        roleName: r.role_name,
        roleColor: r.role_color,
        position: r.position,
      }));
      const n = await sql<{ nickname: string | null }[]>`
        select nickname from server_profiles where user_id = ${targetUserId} and server_id = ${serverId} limit 1
      `;
      serverNickname = n[0]?.nickname ?? null;
    }

    res.json({
      id: user.id,
      username: user.name,
      avatarUrl: user.avatar_url,
      presence: (presence[0]?.status ?? 'offline') as 'online' | 'idle' | 'dnd' | 'offline',
      mutualServersCount: 0,
      mutualFriendsCount: 0,
      isFriend: !!isFriend[0],
      incomingFriendRequest: !!incomingReq[0],
      outgoingFriendRequest: !!outgoingReq[0],
      friendRequestId: incomingReq[0]?.id ?? outgoingReq[0]?.id ?? null,
      isBlocked: !!isBlocked[0],
      rolesInServer,
      serverNickname,
    });
  });
}
