import { z } from 'zod';
import type { RouteDeps } from './types.js';
import type { AuthedRequest } from '../infra.js';
import { MESSAGE_LIMITS, PAGINATION } from '../constants.js';
import { emitNotification } from '../notifications/emit.js';

const messagesGetSchema = z.object({
  channelId: z.string().min(1),
  limit: z.coerce.number().min(1).max(PAGINATION.MESSAGES_MAX_LIMIT).optional().default(PAGINATION.MESSAGES_DEFAULT_LIMIT),
  offset: z.coerce.number().min(0).optional().default(0),
  after: z.coerce.number().min(0).optional(),
  cursor: z.union([z.string(), z.number()]).optional(),
});

function setNoCacheHeaders(res: {
  setHeader(name: string, value: string): void;
}) {
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
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

function parseCursorToDate(cursor: string | number | undefined): Date | null {
  if (cursor == null) return null;
  if (typeof cursor === 'number') {
    return new Date(cursor);
  }
  const asNum = Number(cursor);
  if (Number.isFinite(asNum) && String(asNum) === cursor.trim()) {
    return new Date(asNum);
  }
  const ts = Date.parse(cursor);
  return Number.isFinite(ts) ? new Date(ts) : null;
}

function resolveMediaUrl(
  cdnUrl: string | null,
  storageKey: string | null | undefined,
  mediaPublicBaseUrl: string
): string {
  if (cdnUrl && cdnUrl.trim() !== '') {
    return cdnUrl;
  }
  const key = (storageKey ?? '').trim();
  if (!key) return '';
  if (/^https?:\/\//i.test(key)) return key;
  const normalizedBase = mediaPublicBaseUrl.replace(/\/$/, '');
  return `${normalizedBase}/${key.replace(/^\/+/, '')}`;
}

const mediaItemSchema = z.object({
  mediaId: z.string().uuid().optional(),
  url: z.string().min(1),
  public_id: z.string().optional(),
  fileName: z.string().optional(),
  fileSize: z.number().optional(),
  mimeType: z.string().optional(),
});
const messageCreateSchema = z.object({
  channelId: z.string().min(1),
  content: z.string().max(MESSAGE_LIMITS.MAX_CONTENT_LENGTH).optional(),
  replyToMessageId: z.string().uuid().optional().nullable(),
  clientGeneratedId: z.string().optional(),
  media: z.array(mediaItemSchema).optional(),
  /** User IDs to notify as mention (from @mention picker). Only these users get mention:channel. */
  mentionUserIds: z.array(z.string().uuid()).optional(),
});

function forbiddenBody(code: string): { error: string; code: string } {
  return { error: 'Forbidden', code };
}

async function checkChannelAccess(
  res: { status: (code: number) => { json: (body: object) => void } },
  sql: RouteDeps['sql'],
  infra: RouteDeps['infra'],
  userId: string,
  channelId: string,
  mode: 'read' | 'send',
  hasMedia: boolean
): Promise<boolean> {
  const serverChannel = await sql<{ server_id: string }[]>`select server_id from channels where id = ${channelId} limit 1`;
  if (serverChannel[0]) {
    const bits = await infra.getChannelPermissionBits(userId, channelId);
    if (bits == null) {
      res.status(403).json(forbiddenBody('CHANNEL_ACCESS_DENIED'));
      return false;
    }
    if (!infra.hasPerm(bits, infra.PERM.VIEW_CHANNEL)) {
      res.status(403).json(forbiddenBody('CHANNEL_ACCESS_DENIED'));
      return false;
    }
    if (mode === 'read') {
      if (!infra.hasPerm(bits, infra.PERM.READ_MESSAGE_HISTORY)) {
        res.status(403).json(forbiddenBody('CHANNEL_ACCESS_DENIED'));
        return false;
      }
    } else {
      if (!infra.hasPerm(bits, infra.PERM.SEND_MESSAGES)) {
        res.status(403).json(forbiddenBody('CHANNEL_ACCESS_DENIED'));
        return false;
      }
      if (hasMedia && !infra.hasPerm(bits, infra.PERM.ATTACH_FILES)) {
        res.status(403).json(forbiddenBody('CHANNEL_ACCESS_DENIED'));
        return false;
      }
    }
    return true;
  }
  const dm = await sql<{ user1_id: string; user2_id: string }[]>`select user1_id, user2_id from dm_channels where id = ${channelId} limit 1`;
  if (dm[0]) {
    const allowed = dm[0].user1_id === userId || dm[0].user2_id === userId;
    if (!allowed) {
      res.status(403).json(forbiddenBody('CHANNEL_ACCESS_DENIED'));
      return false;
    }
    return true;
  }
  res.status(403).json(forbiddenBody('CHANNEL_NOT_FOUND'));
  return false;
}

export function registerMessageRoutes(deps: RouteDeps): void {
  const { app, sql, redis, infra } = deps;

  app.get('/api/messages', infra.requireAuth, async (req: AuthedRequest, res) => {
    try {
      setNoCacheHeaders(res);
      const parsed = messagesGetSchema.parse(req.query);
      if (!(await checkChannelAccess(res, sql, infra, req.user!.id, parsed.channelId, 'read', false))) return;
      type MessageRow = {
        id: string;
        channel_id: string;
        user_id: string;
        content: string;
        created_at: Date;
        edited_at: Date | null;
        reply_to_id: string | null;
        avatar_url: string | null;
        user_name: string;
      };

      const afterDate = typeof parsed.after === 'number' ? new Date(parsed.after) : null;
      const deprecatedOffsetUsed = parsed.cursor == null && parsed.offset > 0;
      let cursorDate: Date | null = null;

      if (parsed.cursor != null) {
        const cursorId = typeof parsed.cursor === 'string' ? parsed.cursor.trim() : String(parsed.cursor);
        const cursorRows = await sql<{ id: string; created_at: Date }[]>`
          select id, created_at
          from messages
          where id = ${cursorId}
            and channel_id = ${parsed.channelId}
            and deleted_at is null
          limit 1
        `;
        cursorDate = cursorRows[0]?.created_at ?? parseCursorToDate(parsed.cursor);
      }

      let rows: MessageRow[] = [];
      let hasMore = false;
      let nextCursor: string | null = null;

      if (deprecatedOffsetUsed) {
        console.warn('[api/messages] offset pagination is deprecated; cursor should be used instead.', {
          channelId: parsed.channelId,
          offset: parsed.offset,
        });
      }

      if (afterDate) {
        const fetchedRows = await sql<MessageRow[]>`
          select
            m.id,
            m.channel_id,
            m.user_id,
            m.content,
            m.created_at,
            m.edited_at,
            m.reply_to_id,
            u.avatar_url,
            u.name as user_name
          from messages m
          inner join users u on u.id = m.user_id
          where m.channel_id = ${parsed.channelId}
            and m.deleted_at is null
            and m.created_at > ${afterDate}
          order by m.created_at asc
          limit ${parsed.limit + 1}
        `;
        hasMore = fetchedRows.length > parsed.limit;
        rows = fetchedRows.slice(0, parsed.limit);
      } else if (cursorDate) {
        const descRows = await sql<MessageRow[]>`
          select
            m.id,
            m.channel_id,
            m.user_id,
            m.content,
            m.created_at,
            m.edited_at,
            m.reply_to_id,
            u.avatar_url,
            u.name as user_name
          from messages m
          inner join users u on u.id = m.user_id
          where m.channel_id = ${parsed.channelId}
            and m.deleted_at is null
            and m.created_at < ${cursorDate}
          order by m.created_at desc
          limit ${parsed.limit + 1}
        `;
        hasMore = descRows.length > parsed.limit;
        rows = [...descRows.slice(0, parsed.limit)].reverse();
        nextCursor = rows.length > 0 ? rows[0]!.id : null;
      } else {
        if (parsed.offset > 0) {
          const descRows = await sql<MessageRow[]>`
            select
              m.id,
              m.channel_id,
              m.user_id,
              m.content,
              m.created_at,
              m.edited_at,
              m.reply_to_id,
              u.avatar_url,
              u.name as user_name
            from messages m
            inner join users u on u.id = m.user_id
            where m.channel_id = ${parsed.channelId} and m.deleted_at is null
            order by m.created_at desc
            limit ${parsed.limit + 1}
            offset ${parsed.offset}
          `;
          hasMore = descRows.length > parsed.limit;
          rows = [...descRows.slice(0, parsed.limit)].reverse();
        } else {
          const descRows = await sql<MessageRow[]>`
            select
              m.id,
              m.channel_id,
              m.user_id,
              m.content,
              m.created_at,
              m.edited_at,
              m.reply_to_id,
              u.avatar_url,
              u.name as user_name
            from messages m
            inner join users u on u.id = m.user_id
            where m.channel_id = ${parsed.channelId} and m.deleted_at is null
            order by m.created_at desc
            limit ${parsed.limit + 1}
          `;
          hasMore = descRows.length > parsed.limit;
          rows = [...descRows.slice(0, parsed.limit)].reverse();
        }
        nextCursor = rows.length > 0 ? rows[0]!.id : null;
      }

      const messageIds = rows.map((r) => r.id);
      const replyToIds = [...new Set(rows.map((r) => r.reply_to_id).filter(Boolean))] as string[];
      const replyToMap: Map<string, { user_name: string; content: string }> = new Map();
      if (replyToIds.length > 0) {
        const replyRows = await sql<{ id: string; user_name: string; content: string }[]>`
          select m.id, u.name as user_name, m.content
          from messages m
          inner join users u on u.id = m.user_id
          where m.id in ${sql(replyToIds)}
        `;
        for (const row of replyRows) {
          replyToMap.set(row.id, { user_name: row.user_name, content: row.content ?? '' });
        }
      }
      const mediaByMessage: Map<
        string,
        Array<{ id: string; url: string; fileName: string; fileSize: number; mimeType: string; type?: string }>
      > = new Map();
      if (messageIds.length > 0) {
        const mediaRows = await sql<{
          message_id: string;
          id: string;
          cdn_url: string | null;
          storage_key: string;
          file_name: string;
          file_size: number;
          mime_type: string;
        }[]>`
          select message_id, id, cdn_url, storage_key, file_name, file_size, mime_type
          from media_files
          where message_id in ${sql(messageIds)}
        `;
        const mediaBase = infra.MEDIA_PUBLIC_BASE_URL;
        for (const row of mediaRows) {
          const list = mediaByMessage.get(row.message_id) ?? [];
          const type = row.mime_type === 'image/gif' ? 'gif' : row.mime_type.startsWith('image/') ? 'image' : row.mime_type.startsWith('video/') ? 'video' : 'file';
          const url = resolveMediaUrl(row.cdn_url, row.storage_key, mediaBase);
          if (!url) continue;
          list.push({
            id: row.id,
            url,
            fileName: row.file_name,
            fileSize: row.file_size,
            mimeType: row.mime_type,
            type,
          });
          mediaByMessage.set(row.message_id, list);
        }
      }
      const payload = rows.map((m) => {
        const replyTarget = m.reply_to_id ? replyToMap.get(m.reply_to_id) : null;
        return {
          id: m.id,
          content: m.content,
          createdAt: m.created_at.toISOString(),
          editedAt: m.edited_at ? m.edited_at.toISOString() : null,
          user: {
            id: m.user_id,
            name: m.user_name,
            avatarUrl: m.avatar_url,
          },
          replyToId: m.reply_to_id ?? null,
          ...(replyTarget && {
            replyToAuthorUsername: replyTarget.user_name,
            replyToContent: replyTarget.content.slice(0, 200),
          }),
          reactions: [],
          mediaFiles: mediaByMessage.get(m.id) ?? [],
        };
      });
      res.json({
        messages: payload,
        count: payload.length,
        hasMore,
        channelId: parsed.channelId,
        nextCursor,
        deprecatedOffsetUsed,
        serverNow: Date.now(),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', details: error.errors });
        return;
      }
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  app.post('/api/messages', infra.requireAuth, async (req: AuthedRequest, res) => {
    try {
      const parsed = messageCreateSchema.parse(req.body);
      const content = (parsed.content ?? '').trim();
      const mediaItems = parsed.media ?? [];
      const hasMedia = mediaItems.length > 0;
      if (!content && !hasMedia) {
        res.status(400).json({ error: 'Either content or media is required' });
        return;
      }
      const userId = req.user!.id;
      if (!(await checkChannelAccess(res, sql, infra, userId, parsed.channelId, 'send', hasMedia))) return;
      const messageContent = content || ' ';
      const replyToId = (parsed.replyToMessageId && String(parsed.replyToMessageId).trim()) || null;

      if (replyToId) {
        const sameChannel = await sql<{ id: string }[]>`select id from messages where id = ${replyToId} and channel_id = ${parsed.channelId} and deleted_at is null limit 1`;
        if (!sameChannel[0]) {
          res.status(400).json({ error: 'Reply target message not found or in another channel' });
          return;
        }
      }

      const inserted = await sql<{
        id: string;
        channel_id: string;
        user_id: string;
        content: string;
        created_at: Date;
        edited_at: Date | null;
        reply_to_id: string | null;
        avatar_url: string | null;
        user_name: string;
      }[]>`
        with new_message as (
          insert into messages (id, channel_id, user_id, content, reply_to_id, created_at, updated_at)
          values (gen_random_uuid(), ${parsed.channelId}, ${userId}, ${messageContent}, ${replyToId}, now(), now())
          returning id, channel_id, user_id, content, created_at, edited_at, reply_to_id
        )
        select n.id, n.channel_id, n.user_id, n.content, n.created_at, n.edited_at, n.reply_to_id, u.avatar_url, u.name as user_name
        from new_message n
        inner join users u on u.id = n.user_id
      `;
      const m = inserted[0];
      if (!m) {
        res.status(500).json({ error: 'Failed to create message' });
        return;
      }

      const mediaFilesDto: Array<{ id: string; url: string; fileName: string; fileSize: number; mimeType: string; type?: string }> = [];
      if (hasMedia) {
        for (const item of mediaItems) {
          const storageKey = item.public_id ?? item.url;
          const cdnUrl = item.url;
          let rows: {
            id: string;
            file_name: string;
            file_size: number;
            mime_type: string;
            cdn_url?: string | null;
          }[] = [];

          if (item.mediaId) {
            rows = await sql<{
              id: string;
              file_name: string;
              file_size: number;
              mime_type: string;
              cdn_url?: string | null;
            }[]>`
              update media_files
              set channel_id = ${m.channel_id},
                  message_id = ${m.id},
                  file_name = ${item.fileName ?? 'file'},
                  file_size = ${item.fileSize ?? 0},
                  mime_type = ${item.mimeType ?? 'application/octet-stream'},
                  storage_key = ${storageKey},
                  cdn_url = ${cdnUrl}
              where id = ${item.mediaId} and user_id = ${userId} and message_id is null
              returning id, file_name, file_size, mime_type, cdn_url
            `;
          }

          if (!rows[0]) {
            rows = await sql<{
              id: string;
              file_name: string;
              file_size: number;
              mime_type: string;
              cdn_url?: string | null;
            }[]>`
              insert into media_files (id, user_id, channel_id, message_id, file_name, file_size, mime_type, storage_key, cdn_url, created_at)
              values (gen_random_uuid(), ${userId}, ${m.channel_id}, ${m.id}, ${item.fileName ?? 'file'}, ${item.fileSize ?? 0}, ${item.mimeType ?? 'application/octet-stream'}, ${storageKey}, ${cdnUrl}, now())
              returning id, file_name, file_size, mime_type, cdn_url
            `;
          }
          const f = rows[0];
          if (f) {
            const type = (item.mimeType?.startsWith('image/') && item.mimeType !== 'image/gif') ? 'image' : item.mimeType === 'image/gif' ? 'gif' : item.mimeType?.startsWith('video/') ? 'video' : 'file';
            mediaFilesDto.push({
              id: f.id,
              url: f.cdn_url ?? cdnUrl,
              fileName: f.file_name,
              fileSize: f.file_size,
              mimeType: f.mime_type,
              type,
            });
          }
        }
      }

      const replyToIdVal = (m as { reply_to_id?: string | null }).reply_to_id ?? null;
      let replyToSnapshot: { replyToAuthorUsername: string; replyToContent: string } | null = null;
      if (replyToIdVal) {
        const replyRow = await sql<{ user_name: string; content: string }[]>`
          select u.name as user_name, m.content from messages m
          inner join users u on u.id = m.user_id where m.id = ${replyToIdVal} limit 1
        `;
        if (replyRow[0]) {
          replyToSnapshot = { replyToAuthorUsername: replyRow[0].user_name, replyToContent: (replyRow[0].content ?? '').slice(0, 200) };
        }
      }
      const dto = {
        id: m.id,
        channelId: parsed.channelId,
        content: m.content,
        createdAt: m.created_at.toISOString(),
        editedAt: m.edited_at ? m.edited_at.toISOString() : null,
        user: {
          id: m.user_id,
          name: m.user_name,
          avatarUrl: m.avatar_url,
        },
        replyToId: replyToIdVal,
        ...(replyToSnapshot && { replyToAuthorUsername: replyToSnapshot.replyToAuthorUsername, replyToContent: replyToSnapshot.replyToContent }),
        reactions: [],
        mediaFiles: mediaFilesDto,
        clientGeneratedId: parsed.clientGeneratedId ?? null,
      };

      const eventPayload = JSON.stringify({ event: 'message', payload: dto });
      await redis.publish(`realtime:channel:${parsed.channelId}`, eventPayload);

      try {
        const snippet = (m.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) || undefined;
        const emitDeps = { sql, redis, publishRealtime: infra.publishRealtime };
        const serverChannelRows = await sql<{ server_id: string }[]>`
          select server_id from channels where id = ${parsed.channelId} limit 1
        `;
        const now = new Date().toISOString();
        if (serverChannelRows[0]) {
          const serverId = serverChannelRows[0].server_id;
          const channelNameRow = await sql<{ name: string }[]>`select name from channels where id = ${parsed.channelId} limit 1`;
          const channelName = channelNameRow[0]?.name;
          const mentionUserIds = [...new Set(parsed.mentionUserIds ?? [])].filter((id) => id !== userId);
          for (const recipientId of mentionUserIds) {
            await emitNotification(emitDeps, {
              userId: recipientId,
              type: 'mention:channel',
              payload: {
                serverId,
                channelId: parsed.channelId,
                messageId: m.id,
                authorId: userId,
                authorName: m.user_name,
                channelName,
                snippet,
              },
              messageId: m.id,
              channelId: parsed.channelId,
              serverId,
              dedupKey: `msg:${m.id}`,
              skipIfAuthor: true,
              authorId: userId,
            });
          }
        } else {
          const dmRows = await sql<{ user1_id: string; user2_id: string }[]>`
            select user1_id, user2_id from dm_channels where id = ${parsed.channelId} limit 1
          `;
          const dm = dmRows[0];
          if (dm) {
            const recipientUserId = dm.user1_id === userId ? dm.user2_id : dm.user1_id;
            await emitNotification(emitDeps, {
              userId: recipientUserId,
              type: 'message:dm',
              payload: {
                dmId: parsed.channelId,
                messageId: m.id,
                authorId: userId,
                authorName: m.user_name,
                snippet,
              },
              messageId: m.id,
              channelId: parsed.channelId,
              dmId: parsed.channelId,
              dedupKey: `dm:${parsed.channelId}:${m.id}`,
              skipIfAuthor: true,
              authorId: userId,
            });
          }
        }
        await redis.setex(`cache:messages:last:${parsed.channelId}`, 60, JSON.stringify(dto));
        await redis.setex(`cache:messages:lastAt:${parsed.channelId}`, 60, now);
      } catch (error) {
        console.warn('[api/messages] notification pipeline warning:', error);
      }

      setRevalidateTags(res, ['messages', 'channels']);
      res.status(201).json({ message: dto });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', details: error.errors });
        return;
      }
      res.status(500).json({ error: 'Failed to create message' });
    }
  });

  app.patch('/api/messages/:messageId', infra.requireAuth, async (req: AuthedRequest, res) => {
    const messageId = req.params.messageId;
    const content = String((req.body as { content?: string }).content ?? '').trim();
    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }
    const actorId = req.user!.id;
    const rows = await sql<{ id: string; channel_id: string; user_id: string; created_at: Date; edited_at: Date | null; avatar_url: string | null; user_name: string; content: string; reply_to_id: string | null }[]>`
      with upd as (
        update messages
        set content = ${content}, edited_at = now(), updated_at = now()
        where id = ${messageId} and user_id = ${actorId} and deleted_at is null
        returning id, channel_id, user_id, content, created_at, edited_at, reply_to_id
      )
      select upd.id, upd.channel_id, upd.user_id, upd.content, upd.created_at, upd.edited_at, upd.reply_to_id, u.avatar_url, u.name as user_name
      from upd inner join users u on u.id = upd.user_id
    `;
    const m = rows[0];
    if (!m) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    const reactionRows = await sql<{ emoji: string; count: number; reacted_by_me: boolean }[]>`
      select
        r.emoji,
        count(*)::int as count,
        bool_or(r.user_id = ${actorId}) as reacted_by_me
      from reactions r
      where r.message_id = ${m.id}
      group by r.emoji
      order by r.emoji asc
    `;

    const mediaRows = await sql<{
      id: string;
      cdn_url: string | null;
      storage_key: string;
      file_name: string;
      file_size: number;
      mime_type: string;
    }[]>`
      select id, cdn_url, storage_key, file_name, file_size, mime_type
      from media_files
      where message_id = ${m.id}
      order by created_at asc
    `;
    const mediaFiles = mediaRows
      .map((row) => {
        const type = row.mime_type === 'image/gif'
          ? 'gif'
          : row.mime_type.startsWith('image/')
            ? 'image'
            : row.mime_type.startsWith('video/')
              ? 'video'
              : 'file';
        const url = resolveMediaUrl(row.cdn_url, row.storage_key, infra.MEDIA_PUBLIC_BASE_URL);
        return {
          id: row.id,
          url,
          fileName: row.file_name,
          fileSize: row.file_size,
          mimeType: row.mime_type,
          type,
        };
      })
      .filter((row) => row.url !== '');

    let replyToAuthorUsername: string | undefined;
    let replyToContent: string | undefined;
    if (m.reply_to_id) {
      const replyRows = await sql<{ user_name: string; content: string }[]>`
        select u.name as user_name, rm.content
        from messages rm
        inner join users u on u.id = rm.user_id
        where rm.id = ${m.reply_to_id}
        limit 1
      `;
      if (replyRows[0]) {
        replyToAuthorUsername = replyRows[0].user_name;
        replyToContent = replyRows[0].content.slice(0, 200);
      }
    }

    const dto = {
      id: m.id,
      channelId: m.channel_id,
      content: m.content,
      createdAt: m.created_at.toISOString(),
      editedAt: m.edited_at ? m.edited_at.toISOString() : null,
      user: { id: m.user_id, name: m.user_name, avatarUrl: m.avatar_url },
      replyToId: m.reply_to_id ?? null,
      ...(replyToAuthorUsername != null && { replyToAuthorUsername }),
      ...(replyToContent != null && { replyToContent }),
      reactions: reactionRows.map((row) => ({
        emoji: row.emoji,
        count: row.count,
        reactedByMe: !!row.reacted_by_me,
      })),
      mediaFiles,
    };
    await infra.publishRealtime(`channel:${m.channel_id}`, 'message:updated', dto);
    setRevalidateTags(res, ['messages']);
    res.json({ message: dto });
  });

  app.delete('/api/messages/:messageId', infra.requireAuth, async (req: AuthedRequest, res) => {
    const actorId = req.user!.id;
    const messageRows = await sql<{ id: string; channel_id: string; user_id: string; deleted_at: Date | null }[]>`
      select id, channel_id, user_id, deleted_at
      from messages
      where id = ${req.params.messageId}
      limit 1
    `;
    const message = messageRows[0];
    if (!message || message.deleted_at) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    const isOwnMessage = message.user_id === actorId;
    if (!isOwnMessage) {
      const bits = await infra.getChannelPermissionBits(actorId, message.channel_id);
      if (bits == null || !infra.hasPerm(bits, infra.PERM.MANAGE_MESSAGES)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    }

    const rows = await sql<{ id: string; channel_id: string }[]>`
      update messages
      set deleted_at = now(), updated_at = now()
      where id = ${message.id} and deleted_at is null
      returning id, channel_id
    `;
    const m = rows[0];
    if (!m) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    await infra.publishRealtime(`channel:${m.channel_id}`, 'message:deleted', { id: m.id, channelId: m.channel_id });
    setRevalidateTags(res, ['messages']);
    res.json({ success: true });
  });

  app.post('/api/messages/:messageId/reactions', infra.requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const messageId = req.params.messageId;
    const emoji = String((req.body as { emoji?: string }).emoji ?? '').trim();
    if (!emoji) {
      res.status(400).json({ error: 'emoji is required' });
      return;
    }
    const messageRows = await sql<{ channel_id: string }[]>`select channel_id from messages where id = ${messageId} limit 1`;
    const channelId = messageRows[0]?.channel_id;
    if (!channelId) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    if (!(await checkChannelAccess(res, sql, infra, userId, channelId, 'read', false))) return;
    const channelBits = await infra.getChannelPermissionBits(userId, channelId);
    if (channelBits != null && !infra.hasPerm(channelBits, infra.PERM.ADD_REACTIONS)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    if (channelBits == null) {
      const dm = await sql<{ user1_id: string; user2_id: string }[]>`select user1_id, user2_id from dm_channels where id = ${channelId} limit 1`;
      if (!dm[0] || (dm[0].user1_id !== userId && dm[0].user2_id !== userId)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    }
    await sql`
      insert into reactions (id, message_id, user_id, emoji, created_at)
      values (gen_random_uuid(), ${messageId}, ${userId}, ${emoji}, now())
      on conflict (message_id, user_id, emoji) do nothing
    `;
    await infra.publishRealtime(`channel:${channelId}`, 'message_reaction_added', { messageId, emoji, userId, channelId });
    setRevalidateTags(res, ['messages']);
    res.json({ success: true });
  });

  app.delete('/api/messages/:messageId/reactions', infra.requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const messageId = req.params.messageId;
    const emoji = String(req.query.emoji ?? (req.body as { emoji?: string }).emoji ?? '').trim();
    if (!emoji) {
      res.status(400).json({ error: 'emoji is required' });
      return;
    }
    const messageRows = await sql<{ channel_id: string }[]>`select channel_id from messages where id = ${messageId} limit 1`;
    const channelId = messageRows[0]?.channel_id;
    if (!channelId) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    if (!(await checkChannelAccess(res, sql, infra, userId, channelId, 'read', false))) return;
    await sql`delete from reactions where message_id = ${messageId} and user_id = ${userId} and emoji = ${emoji}`;
    await infra.publishRealtime(`channel:${channelId}`, 'message_reaction_removed', { messageId, emoji, userId, channelId });
    setRevalidateTags(res, ['messages']);
    res.json({ success: true });
  });
}
