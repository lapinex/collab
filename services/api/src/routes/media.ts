import crypto from 'node:crypto';
import { z } from 'zod';
import type { RouteDeps } from './types.js';
import type { AuthedRequest } from '../infra.js';
import { MEDIA_LIMITS } from '../constants.js';
import {
  isCloudinaryConfigured,
  getCloudinaryUploadParams,
  cloudinaryDelete,
} from '../cloudinary.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { MEDIA_ROOT } from '../infra.js';

const PENDING_UPLOAD_TTL = 600; // 10 min
const DEPRECATION_DEADLINE = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10); // 60 days

const requestUploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().min(0),
  contentType: z.string().min(1),
  folder: z.enum(['avatars', 'stickers', 'emojis', 'chat']).optional().default('chat'),
  isSticker: z.boolean().optional().default(false),
  isEmoji: z.boolean().optional().default(false),
  serverId: z.string().uuid().optional(),
});

const confirmUploadSchema = z.object({
  mediaId: z.string().uuid(),
  publicId: z.string().min(1),
  url: z.string().url(),
});

function getMaxSize(
  folder: string,
  isSticker: boolean,
  isEmoji: boolean,
  contentType: string
): number {
  if (isEmoji) return MEDIA_LIMITS.EMOJI_MAX_SIZE;
  if (isSticker) return MEDIA_LIMITS.STICKER_MAX_SIZE;
  if (folder === 'avatars') return MEDIA_LIMITS.MAX_IMAGE_SIZE;
  const isVideo = contentType.startsWith('video/');
  const isGif = contentType === 'image/gif';
  if (isVideo) return MEDIA_LIMITS.MAX_VIDEO_SIZE;
  if (isGif) return MEDIA_LIMITS.MAX_GIF_SIZE;
  return MEDIA_LIMITS.MAX_IMAGE_SIZE;
}

function isAllowedMime(contentType: string): boolean {
  return MEDIA_LIMITS.ALLOWED_MIME_TYPES.includes(contentType as (typeof MEDIA_LIMITS.ALLOWED_MIME_TYPES)[number]);
}

export function registerMediaRoutes(deps: RouteDeps): void {
  const { app, sql, redis, infra } = deps;

  app.post('/api/media/request-upload', infra.requireAuth, async (req: AuthedRequest, res) => {
    const parseResult = requestUploadSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation error', details: parseResult.error.flatten() });
      return;
    }
    const body = parseResult.data;
    const userId = req.user!.id;

    if (body.isSticker || body.isEmoji) {
      if (!body.serverId) {
        res.status(400).json({ error: 'serverId is required for sticker/emoji upload' });
        return;
      }
      if (!(await infra.ensureServerMember(res, userId, body.serverId))) return;
      const perms = await infra.getServerPermissionBits(userId, body.serverId);
      if (!infra.hasPerm(perms, infra.PERM.MANAGE_SERVER) && !infra.hasPerm(perms, infra.PERM.MANAGE_ROLES)) {
        res.status(403).json({ error: 'Forbidden: need MANAGE_SERVER or MANAGE_ROLES' });
        return;
      }
    }

    if (!isAllowedMime(body.contentType)) {
      res.status(400).json({ error: 'Content type not allowed', contentType: body.contentType });
      return;
    }
    const maxSize = getMaxSize(body.folder, body.isSticker, body.isEmoji, body.contentType);
    if (body.fileSize > maxSize) {
      res.status(400).json({
        error: 'File too large',
        maxSize,
        fileSize: body.fileSize,
      });
      return;
    }

    const mediaId = crypto.randomUUID();
    const publicId = `${body.folder}/${Date.now()}_${mediaId.replace(/-/g, '')}`;
    const pending = {
      userId,
      fileName: body.fileName,
      fileSize: body.fileSize,
      contentType: body.contentType,
      folder: body.folder,
    };
    await redis.setex(
      `pending_upload:${mediaId}`,
      PENDING_UPLOAD_TTL,
      JSON.stringify(pending)
    );

    if (!isCloudinaryConfigured()) {
      res.status(503).json({
        error: 'Presigned upload not configured',
        message: 'Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET',
      });
      return;
    }

    const resourceType = body.contentType.startsWith('video/') ? 'video' as const : 'image' as const;
    const params = getCloudinaryUploadParams(publicId, body.folder, resourceType);
    if (!params) {
      res.status(503).json({ error: 'Failed to generate upload params' });
      return;
    }

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    res.json({
      uploadUrl: params.uploadUrl,
      mediaId,
      publicId: params.public_id ?? publicId,
      expiresAt,
      params: {
        api_key: params.api_key,
        timestamp: params.timestamp,
        signature: params.signature,
        public_id: params.public_id,
        folder: params.folder,
        resource_type: params.resource_type,
      },
    });
  });

  app.post('/api/media/confirm-upload', infra.requireAuth, async (req: AuthedRequest, res) => {
    const parseResult = confirmUploadSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation error', details: parseResult.error.flatten() });
      return;
    }
    const { mediaId, publicId, url } = parseResult.data;
    const userId = req.user!.id;

    const raw = await redis.get(`pending_upload:${mediaId}`);
    if (!raw) {
      res.status(404).json({ error: 'Upload session expired or invalid' });
      return;
    }
    let pending: { userId: string; fileName: string; fileSize: number; contentType: string; folder: string };
    try {
      pending = JSON.parse(raw) as typeof pending;
    } catch {
      await redis.del(`pending_upload:${mediaId}`);
      res.status(400).json({ error: 'Invalid pending upload data' });
      return;
    }
    if (pending.userId !== userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    try {
      const headRes = await fetch(url, { method: 'HEAD' });
      if (!headRes.ok) {
        res.status(400).json({ error: 'File at URL could not be verified' });
        return;
      }
    } catch {
      res.status(400).json({ error: 'Failed to verify upload URL' });
      return;
    }

    const rows = await sql<{
      id: string;
      user_id: string;
      file_name: string;
      file_size: number;
      mime_type: string;
      storage_key: string;
      cdn_url: string | null;
      created_at: Date;
    }[]>`
      insert into media_files (id, user_id, channel_id, message_id, file_name, file_size, mime_type, storage_key, cdn_url, created_at)
      values (${mediaId}, ${userId}, null, null, ${pending.fileName}, ${pending.fileSize}, ${pending.contentType}, ${publicId}, ${url}, now())
      returning id, user_id, file_name, file_size, mime_type, storage_key, cdn_url, created_at
    `;
    await redis.del(`pending_upload:${mediaId}`);
    const row = rows[0];
    if (!row) {
      res.status(500).json({ error: 'Failed to save media record' });
      return;
    }
    res.json({
      id: row.id,
      url: row.cdn_url ?? url,
      publicId: row.storage_key,
      fileName: row.file_name,
      fileSize: row.file_size,
      mimeType: row.mime_type,
      createdAt: row.created_at.toISOString(),
      uploadedBy: row.user_id,
    });
  });

  app.delete('/api/media/:mediaId', infra.requireAuth, async (req: AuthedRequest, res) => {
    const mediaId = req.params.mediaId;
    const userId = req.user!.id;

    const rows = await sql<{
      id: string;
      user_id: string;
      storage_key: string;
      cdn_url: string | null;
    }[]>`
      select id, user_id, storage_key, cdn_url from media_files where id = ${mediaId} limit 1
    `;
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: 'Media not found' });
      return;
    }
    if (row.user_id !== userId) {
      res.status(403).json({ error: 'Forbidden: only the uploader can delete' });
      return;
    }

    const cdnUrl = row.cdn_url ?? '';
    if (cdnUrl.includes('cloudinary.com')) {
      const resourceType = cdnUrl.includes('/video/') ? 'video' as const : 'image' as const;
      await cloudinaryDelete(row.storage_key, resourceType);
    } else if (row.storage_key) {
      const filePath = path.join(MEDIA_ROOT, row.storage_key);
      try {
        await fs.unlink(filePath);
      } catch {
        // ignore if file missing
      }
    }

    await sql`delete from media_files where id = ${mediaId}`;
    res.status(204).send();
  });

  app.post('/api/media/upload', infra.requireAuth, async (_req: AuthedRequest, res) => {
    res.status(400).json({ error: 'Use /api/media/upload-direct or presigned flow (request-upload + confirm-upload)' });
  });

  app.post('/api/media/complete', infra.requireAuth, async (_req: AuthedRequest, res) => {
    res.status(400).json({ error: 'Use /api/media/upload-direct or presigned flow (request-upload + confirm-upload)' });
  });

  app.post('/api/media/upload-direct', infra.requireAuth, async (req: AuthedRequest, res) => {
    res.setHeader('Deprecated', 'true');
    res.setHeader('X-Deprecation-Deadline', DEPRECATION_DEADLINE);

    const body = req.body as { fileName?: string; fileSize?: number; contentType?: string; fileData?: string; folder?: string };
    if (!body.fileName || !body.contentType || !body.fileData) {
      res.status(400).json({ error: 'fileName, contentType, fileData are required' });
      return;
    }
    try {
      const storageKey = infra.buildStorageKey(body.fileName, body.folder ?? 'chat');
      await infra.saveBase64ToMedia(storageKey, body.fileData);
      const publicUrl = `${infra.MEDIA_PUBLIC_BASE_URL}/${storageKey}`.replace(/\\/g, '/');
      const rows = await sql<{
        id: string;
        user_id: string;
        channel_id: string | null;
        message_id: string | null;
        file_name: string;
        file_size: number;
        mime_type: string;
        storage_key: string;
        cdn_url: string | null;
        created_at: Date;
      }[]>`
        insert into media_files (id, user_id, channel_id, message_id, file_name, file_size, mime_type, storage_key, cdn_url, created_at)
        values (gen_random_uuid(), ${req.user!.id}, null, null, ${body.fileName}, ${body.fileSize ?? 0}, ${body.contentType}, ${storageKey}, ${publicUrl}, now())
        returning id, user_id, channel_id, message_id, file_name, file_size, mime_type, storage_key, cdn_url, created_at
      `;
      const f = rows[0]!;
      res.json({
        url: publicUrl,
        public_id: storageKey,
        fileName: f.file_name,
        fileSize: f.file_size,
        mimeType: f.mime_type,
        file: {
          id: f.id,
          userId: f.user_id,
          channelId: f.channel_id,
          messageId: f.message_id,
          fileName: f.file_name,
          fileSize: f.file_size,
          mimeType: f.mime_type,
          storageKey: f.storage_key,
          cdnUrl: f.cdn_url,
          createdAt: f.created_at.toISOString(),
        },
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Upload failed' });
    }
  });
}
