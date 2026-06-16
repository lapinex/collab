import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import postgres from 'postgres';
import { Redis } from 'ioredis';
import { z } from 'zod';
import { RATE_LIMITS, FILE_LIMITS, USER_LIMITS } from './constants.js';

type AuthClaims = {
  sub: string;
  email: string;
  name?: string;
  role?: string;
  type: 'access';
};

export const NODE_ENV = process.env.NODE_ENV ?? 'development';
const isProd = NODE_ENV === 'production';
export const PORT = Number(process.env.PORT || process.env.API_PORT || 4000);
const DATABASE_URL = (process.env.DATABASE_URL ?? '').trim();
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
export const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET ?? '';
const JWT_ACCESS_TTL = process.env.JWT_ACCESS_TTL ?? '15m';
const JWT_REFRESH_TTL_DAYS = Number(process.env.JWT_REFRESH_TTL_DAYS ?? 14);
export const AUTH_REFRESH_COOKIE_NAME = process.env.AUTH_REFRESH_COOKIE_NAME ?? 'collab_refresh';
export const AUTH_ACCESS_COOKIE_NAME = process.env.AUTH_ACCESS_COOKIE_NAME ?? 'collab_access';
const AUTH_REFRESH_COOKIE_SECURE = String(process.env.AUTH_REFRESH_COOKIE_SECURE ?? 'false') === 'true';
const AUTH_REFRESH_COOKIE_SAMESITE = (process.env.AUTH_REFRESH_COOKIE_SAMESITE ?? 'lax') as 'strict' | 'lax' | 'none';
export const AUTH_BEARER_ISSUER = process.env.AUTH_BEARER_ISSUER ?? 'collab-api';
export const AUTH_BEARER_AUDIENCE = process.env.AUTH_BEARER_AUDIENCE ?? 'collab-web';
export const MEDIA_ROOT = process.env.MEDIA_ROOT ?? path.resolve(process.cwd(), 'media');
export const MEDIA_PUBLIC_BASE_URL = (
  process.env.MEDIA_PUBLIC_BASE_URL ||
  `${(process.env.CORS_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '')}/media`
).replace(/\/$/, '');

export const LIVEKIT_URL = process.env.LIVEKIT_URL ?? process.env.NEXT_PUBLIC_LIVEKIT_URL ?? '';
export const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? '';
export const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? '';
export const LIVEKIT_WEBHOOK_KEY = process.env.LIVEKIT_WEBHOOK_KEY ?? LIVEKIT_API_SECRET;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}
if (!JWT_SECRET || JWT_SECRET.length < 24) {
  throw new Error('JWT_SECRET is required and should be long');
}

let sqlClient: ReturnType<typeof postgres>;

if (DATABASE_URL.includes('host=/cloudsql/')) {
  const userPassMatch = DATABASE_URL.match(/:\/\/([^:]+):([^@]+)@/);
  const dbNameMatch = DATABASE_URL.match(/@\/([^?]+)\?/);
  const hostMatch = DATABASE_URL.match(/host=([^&]+)/);

  if (!userPassMatch || !dbNameMatch || !hostMatch) {
    throw new Error(`Invalid Unix socket DATABASE_URL format: ${DATABASE_URL}`);
  }

  const DB_USER = decodeURIComponent(userPassMatch[1]);
  const DB_PASS = decodeURIComponent(userPassMatch[2]);
  const DB_NAME = dbNameMatch[1];
  const DB_HOST = hostMatch[1];

  sqlClient = postgres({
    host: DB_HOST,
    port: 5432,
    database: DB_NAME,
    username: DB_USER,
    password: DB_PASS,
    ssl: false,
    max: isProd ? 20 : 6,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false,
  });
} else {
  sqlClient = postgres(DATABASE_URL, {
    max: isProd ? 20 : 6,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false,
  });
}

export const sql = sqlClient;
export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => Math.min(times * 100, 2000),
});

export type RequestUser = {
  id: string;
  email: string;
  role: string;
  globalRole: string;
  name?: string;
};

export type AuthedRequest = express.Request & { user?: RequestUser; accessToken?: string };

export function setupAppMiddleware(app: express.Express): void {
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: CORS_ORIGIN,
      credentials: true,
    })
  );
  app.use(cookieParser());
  app.use(
    express.json({
      limit: Math.ceil(FILE_LIMITS.MAX_FILE_SIZE / (1024 * 1024)) + 'mb',
      verify: (req, _res, buf) => {
        // Required for LiveKit webhook signature verification.
        (req as express.Request & { rawBody?: string }).rawBody = buf.toString('utf8');
      },
    })
  );
  app.use('/media', express.static(MEDIA_ROOT));
  app.use(
    '/api',
    rateLimit({
      windowMs: RATE_LIMITS.API_DEFAULT.windowMs,
      max: RATE_LIMITS.API_DEFAULT.max,
      standardHeaders: true,
    })
  );
}

export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function createAccessToken(user: { id: string; email: string; name: string; globalRole: string | null }): string {
  const expiresIn = JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'];
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.globalRole ?? 'user',
      type: 'access',
    },
    JWT_SECRET,
    {
      algorithm: 'HS256',
      issuer: AUTH_BEARER_ISSUER,
      audience: AUTH_BEARER_AUDIENCE,
      expiresIn,
    }
  );
}

export function createRefreshToken(userId: string): string {
  return jwt.sign(
    {
      sub: userId,
      type: 'refresh',
    },
    JWT_SECRET,
    {
      algorithm: 'HS256',
      issuer: AUTH_BEARER_ISSUER,
      audience: AUTH_BEARER_AUDIENCE,
      expiresIn: `${JWT_REFRESH_TTL_DAYS}d`,
    }
  );
}

export function verifyAccessToken(token: string): AuthClaims {
  const payload = jwt.verify(token, JWT_SECRET, {
    algorithms: ['HS256'],
    issuer: AUTH_BEARER_ISSUER,
    audience: AUTH_BEARER_AUDIENCE,
  }) as jwt.JwtPayload;
  if (payload.type !== 'access' || typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
    throw new Error('Invalid access token payload');
  }
  return {
    sub: payload.sub,
    email: payload.email,
    name: typeof payload.name === 'string' ? payload.name : undefined,
    role: typeof payload.role === 'string' ? payload.role : 'user',
    type: 'access',
  };
}

export function verifyRefreshToken(token: string): { sub: string } {
  const payload = jwt.verify(token, JWT_SECRET, {
    algorithms: ['HS256'],
    issuer: AUTH_BEARER_ISSUER,
    audience: AUTH_BEARER_AUDIENCE,
  }) as jwt.JwtPayload;
  if (payload.type !== 'refresh' || typeof payload.sub !== 'string') {
    throw new Error('Invalid refresh token payload');
  }
  return { sub: payload.sub };
}

export function setRefreshCookie(res: express.Response, token: string): void {
  res.cookie(AUTH_REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: AUTH_REFRESH_COOKIE_SECURE,
    sameSite: AUTH_REFRESH_COOKIE_SAMESITE,
    path: '/',
    maxAge: JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function setAccessCookie(res: express.Response, token: string): void {
  res.cookie(AUTH_ACCESS_COOKIE_NAME, token, {
    httpOnly: true,
    secure: AUTH_REFRESH_COOKIE_SECURE,
    sameSite: AUTH_REFRESH_COOKIE_SAMESITE,
    path: '/',
    maxAge: 15 * 60 * 1000,
  });
}

export function clearRefreshCookie(res: express.Response): void {
  res.clearCookie(AUTH_REFRESH_COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    secure: AUTH_REFRESH_COOKIE_SECURE,
    sameSite: AUTH_REFRESH_COOKIE_SAMESITE,
  });
}

export function clearAccessCookie(res: express.Response): void {
  res.clearCookie(AUTH_ACCESS_COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    secure: AUTH_REFRESH_COOKIE_SECURE,
    sameSite: AUTH_REFRESH_COOKIE_SAMESITE,
  });
}

export const PERM = {
  MANAGE_SERVER: 1 << 0,
  VIEW_SERVER: 1 << 1,
  MANAGE_ROLES: 1 << 2,
  MANAGE_CHANNELS: 1 << 3,
  MANAGE_MEMBERS: 1 << 4,
  KICK_MEMBERS: 1 << 5,
  BAN_MEMBERS: 1 << 6,
  CREATE_INVITES: 1 << 7,
  MANAGE_INVITES: 1 << 8,
  VIEW_AUDIT_LOG: 1 << 9,
  VIEW_CHANNEL: 1 << 10,
  SEND_MESSAGES: 1 << 11,
  MANAGE_MESSAGES: 1 << 13,
  ATTACH_FILES: 1 << 15,
  READ_MESSAGE_HISTORY: 1 << 16,
  MENTION_EVERYONE: 1 << 17,
  ADD_REACTIONS: 1 << 19,
  CONNECT: 1 << 20,
  SPEAK: 1 << 21,
  MUTE_MEMBERS: 1 << 22,
  DEAFEN_MEMBERS: 1 << 23,
} as const;

export function hasPerm(bits: number, mask: number): boolean {
  return (bits & mask) === mask;
}

export function toPermissionFlags(bits: number): Record<string, boolean> {
  return {
    canViewServer: hasPerm(bits, PERM.VIEW_SERVER),
    canViewChannel: hasPerm(bits, PERM.VIEW_CHANNEL),
    canSendMessages: hasPerm(bits, PERM.SEND_MESSAGES),
    canAttachFiles: hasPerm(bits, PERM.ATTACH_FILES),
    canAddReactions: hasPerm(bits, PERM.ADD_REACTIONS),
    canConnect: hasPerm(bits, PERM.CONNECT),
    canSpeak: hasPerm(bits, PERM.SPEAK),
    canManageMessages: hasPerm(bits, PERM.MANAGE_MESSAGES),
    canManageRoles: hasPerm(bits, PERM.MANAGE_ROLES),
    canManageChannels: hasPerm(bits, PERM.MANAGE_CHANNELS),
    canManageMembers: hasPerm(bits, PERM.MANAGE_MEMBERS),
    canKickMembers: hasPerm(bits, PERM.KICK_MEMBERS),
    canBanMembers: hasPerm(bits, PERM.BAN_MEMBERS),
    canCreateInvites: hasPerm(bits, PERM.CREATE_INVITES),
    canManageInvites: hasPerm(bits, PERM.MANAGE_INVITES),
    canViewAuditLog: hasPerm(bits, PERM.VIEW_AUDIT_LOG),
    canMentionEveryone: hasPerm(bits, PERM.MENTION_EVERYONE),
    canMuteMembers: hasPerm(bits, PERM.MUTE_MEMBERS),
    canDeafenMembers: hasPerm(bits, PERM.DEAFEN_MEMBERS),
  };
}

export function defaultMemberPermissions(): number {
  return (
    PERM.VIEW_SERVER |
    PERM.VIEW_CHANNEL |
    PERM.SEND_MESSAGES |
    PERM.READ_MESSAGE_HISTORY |
    PERM.ADD_REACTIONS |
    PERM.ATTACH_FILES |
    PERM.CONNECT |
    PERM.SPEAK |
    PERM.CREATE_INVITES
  );
}

export function ownerPermissions(): number {
  return (
    PERM.MANAGE_SERVER |
    PERM.VIEW_SERVER |
    PERM.MANAGE_ROLES |
    PERM.MANAGE_CHANNELS |
    PERM.MANAGE_MEMBERS |
    PERM.KICK_MEMBERS |
    PERM.BAN_MEMBERS |
    PERM.CREATE_INVITES |
    PERM.MANAGE_INVITES |
    PERM.VIEW_AUDIT_LOG |
    PERM.VIEW_CHANNEL |
    PERM.READ_MESSAGE_HISTORY |
    PERM.SEND_MESSAGES |
    PERM.MANAGE_MESSAGES |
    PERM.ATTACH_FILES |
    PERM.MENTION_EVERYONE |
    PERM.ADD_REACTIONS |
    PERM.CONNECT |
    PERM.SPEAK |
    PERM.MUTE_MEMBERS |
    PERM.DEAFEN_MEMBERS
  );
}

export async function publishRealtime(topic: string, event: string, payload: unknown): Promise<void> {
  await redis.publish(`realtime:${topic}`, JSON.stringify({ event, payload }));
}

export async function getServerPermissionBits(userId: string, serverId: string): Promise<number> {
  const owner = await sql<{ owner_id: string }[]>`
    select owner_id from servers where id = ${serverId} limit 1
  `;
  if (owner[0]?.owner_id === userId) return ownerPermissions();
  const roleBits = await sql<{ permissions: number }[]>`
    select coalesce(sum(r.permissions), 0)::int as permissions
    from user_roles ur
    inner join roles r on r.id = ur.role_id
    where ur.user_id = ${userId} and ur.server_id = ${serverId}
  `;
  return roleBits[0]?.permissions ?? 0;
}

type ChannelOverwriteRow = { role_id: string | null; user_id: string | null; allow_permissions: number; deny_permissions: number };

/**
 * Returns final channel-level permission bits (server roles + channel overwrites).
 * Returns null if channelId is not a server channel (e.g. DM).
 */
export async function getChannelPermissionBits(userId: string, channelId: string): Promise<number | null> {
  const channelRow = await sql<{ server_id: string; parent_id: string | null }[]>`
    select server_id, parent_id from channels where id = ${channelId} limit 1
  `;
  if (!channelRow[0]) return null;
  const serverId = channelRow[0].server_id;
  const parentId = channelRow[0].parent_id;

  const owner = await sql<{ owner_id: string }[]>`select owner_id from servers where id = ${serverId} limit 1`;
  if (owner[0]?.owner_id === userId) return ownerPermissions();

  let bits = await getServerPermissionBits(userId, serverId);

  const everyoneRole = await sql<{ id: string }[]>`
    select id from roles where server_id = ${serverId} and (name = '@everyone' or position = 0) limit 1
  `;
  const everyoneRoleId = everyoneRole[0]?.id ?? null;

  const userRolesList = await sql<{ role_id: string; position: number }[]>`
    select ur.role_id, r.position
    from user_roles ur
    inner join roles r on r.id = ur.role_id
    where ur.user_id = ${userId} and ur.server_id = ${serverId}
  `;
  const userRoleIds = new Set(userRolesList.map((r) => r.role_id));
  const rolePositionById = new Map(userRolesList.map((r) => [r.role_id, r.position]));

  const applyOverwrites = (rows: ChannelOverwriteRow[]): void => {
    const everyone = everyoneRoleId ? rows.find((r) => r.role_id === everyoneRoleId && !r.user_id) : null;
    if (everyone) {
      bits = (bits & ~everyone.deny_permissions) | everyone.allow_permissions;
    }
    const roleOverwrites = rows
      .filter((r) => r.role_id && r.role_id !== everyoneRoleId && userRoleIds.has(r.role_id))
      .map((r) => ({ ...r, position: rolePositionById.get(r.role_id!) ?? 0 }))
      .sort((a, b) => b.position - a.position);
    for (const ow of roleOverwrites) {
      bits = (bits & ~ow.deny_permissions) | ow.allow_permissions;
    }
  };

  if (parentId) {
    const parentOverwrites = await sql<ChannelOverwriteRow[]>`
      select role_id, user_id, allow_permissions, deny_permissions
      from channel_permissions
      where channel_id = ${parentId}
    `;
    applyOverwrites(parentOverwrites);
  }

  const channelOverwrites = await sql<ChannelOverwriteRow[]>`
    select role_id, user_id, allow_permissions, deny_permissions
    from channel_permissions
    where channel_id = ${channelId}
  `;
  applyOverwrites(channelOverwrites);

  const userOverwrite = channelOverwrites.find((r) => r.user_id === userId);
  if (userOverwrite) {
    bits = (bits & ~userOverwrite.deny_permissions) | userOverwrite.allow_permissions;
  }

  return bits;
}

/** Max channels per request for list endpoint to avoid heavy batch permission load. */
export const CHANNELS_LIST_MAX_LIMIT = 50;

/**
 * Batch version: returns final channel-level permission bits for many channels (same server).
 * Use for GET /api/servers/:serverId/channels to avoid N+1 queries.
 * Returns Map<channelId, bits>; channelId not in map => not a server channel or missing.
 */
export async function getChannelPermissionBitsForMany(
  userId: string,
  channelIds: string[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (channelIds.length === 0) return result;

  const channels = await sql<{ id: string; server_id: string; parent_id: string | null }[]>`
    select id, server_id, parent_id from channels where id = ANY(${channelIds})
  `;
  if (channels.length === 0) return result;

  const serverIds = [...new Set(channels.map((c) => c.server_id))];
  const parentIds = [...new Set(channels.map((c) => c.parent_id).filter((id): id is string => id != null))];

  const owners = await sql<{ id: string; owner_id: string }[]>`
    select id, owner_id from servers where id = ANY(${serverIds})
  `;
  const ownerByServer = new Map(owners.map((o) => [o.id, o.owner_id]));

  const roleSums = await sql<{ server_id: string; permissions: number }[]>`
    select ur.server_id, coalesce(sum(r.permissions), 0)::int as permissions
    from user_roles ur
    inner join roles r on r.id = ur.role_id
    where ur.user_id = ${userId} and ur.server_id = ANY(${serverIds})
    group by ur.server_id
  `;
  const baseBitsByServer = new Map(roleSums.map((r) => [r.server_id, r.permissions]));
  for (const serverId of serverIds) {
    if (ownerByServer.get(serverId) === userId) {
      baseBitsByServer.set(serverId, ownerPermissions());
    } else if (!baseBitsByServer.has(serverId)) {
      baseBitsByServer.set(serverId, 0);
    }
  }

  const everyoneRoles = await sql<{ server_id: string; id: string }[]>`
    select distinct on (server_id) server_id, id
    from roles
    where server_id = ANY(${serverIds}) and (name = '@everyone' or position = 0)
    order by server_id, (name = '@everyone') desc, position asc, id asc
  `;
  const everyoneByServer = new Map(everyoneRoles.map((r) => [r.server_id, r.id]));

  const userRolesList = await sql<{ server_id: string; role_id: string; position: number }[]>`
    select ur.server_id, ur.role_id, r.position
    from user_roles ur
    inner join roles r on r.id = ur.role_id
    where ur.user_id = ${userId} and ur.server_id = ANY(${serverIds})
  `;
  const userRoleIdsByServer = new Map<string, Set<string>>();
  const rolePositionByServer = new Map<string, Map<string, number>>();
  for (const ur of userRolesList) {
    if (!userRoleIdsByServer.has(ur.server_id)) userRoleIdsByServer.set(ur.server_id, new Set());
    userRoleIdsByServer.get(ur.server_id)!.add(ur.role_id);
    if (!rolePositionByServer.has(ur.server_id)) rolePositionByServer.set(ur.server_id, new Map());
    rolePositionByServer.get(ur.server_id)!.set(ur.role_id, ur.position);
  }

  const allChannelIdsForOverwrites = [...new Set([...channelIds, ...parentIds])];
  const overwritesRaw = await sql<{
    channel_id: string;
    role_id: string | null;
    user_id: string | null;
    allow_permissions: number;
    deny_permissions: number;
  }[]>`
    select channel_id, role_id, user_id, allow_permissions, deny_permissions
    from channel_permissions
    where channel_id = ANY(${allChannelIdsForOverwrites})
  `;
  const overwritesByChannel = new Map<string, ChannelOverwriteRow[]>();
  for (const row of overwritesRaw) {
    const list = overwritesByChannel.get(row.channel_id) ?? [];
    list.push({
      role_id: row.role_id,
      user_id: row.user_id,
      allow_permissions: row.allow_permissions,
      deny_permissions: row.deny_permissions,
    });
    overwritesByChannel.set(row.channel_id, list);
  }

  function applyOverwrites(
    bits: number,
    overwrites: ChannelOverwriteRow[],
    serverId: string,
    userIdOverride: string
  ): number {
    let out = bits;
    const everyoneId = everyoneByServer.get(serverId) ?? null;
    const userRoleIds = userRoleIdsByServer.get(serverId) ?? new Set();
    const rolePosition = rolePositionByServer.get(serverId) ?? new Map();
    const everyone = everyoneId ? overwrites.find((r) => r.role_id === everyoneId && !r.user_id) : null;
    if (everyone) {
      out = (out & ~everyone.deny_permissions) | everyone.allow_permissions;
    }
    const roleOverwrites = overwrites
      .filter((r) => r.role_id && r.role_id !== everyoneId && userRoleIds.has(r.role_id))
      .map((r) => ({ ...r, position: rolePosition.get(r.role_id!) ?? 0 }))
      .sort((a, b) => b.position - a.position);
    for (const ow of roleOverwrites) {
      out = (out & ~ow.deny_permissions) | ow.allow_permissions;
    }
    const userOw = overwrites.find((r) => r.user_id === userIdOverride);
    if (userOw) {
      out = (out & ~userOw.deny_permissions) | userOw.allow_permissions;
    }
    return out;
  }

  for (const ch of channels) {
    const serverId = ch.server_id;
    let bits = baseBitsByServer.get(serverId) ?? 0;
    const parentOverwrites = ch.parent_id ? overwritesByChannel.get(ch.parent_id) ?? [] : [];
    const channelOverwrites = overwritesByChannel.get(ch.id) ?? [];
    bits = applyOverwrites(bits, parentOverwrites, serverId, userId);
    bits = applyOverwrites(bits, channelOverwrites, serverId, userId);
    result.set(ch.id, bits);
  }

  return result;
}

export async function isServerMember(userId: string, serverId: string): Promise<boolean> {
  const rows = await sql<{ ok: number }[]>`
    with c as (
      select 1 as ok from servers where id = ${serverId} and owner_id = ${userId}
      union all
      select 1 as ok from user_roles where user_id = ${userId} and server_id = ${serverId} limit 1
    )
    select 1 as ok from c limit 1
  `;
  return !!rows[0];
}

export async function ensureServerMember(res: express.Response, userId: string, serverId: string): Promise<boolean> {
  const ok = await isServerMember(userId, serverId);
  if (!ok) {
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }
  return true;
}

export function sanitizePathSegment(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function buildStorageKey(fileName: string, folder = 'chat'): string {
  const ext = path.extname(fileName || '').slice(0, 16).toLowerCase() || '.bin';
  const cleanFolder = sanitizePathSegment(folder || 'chat');
  const base = sanitizePathSegment(path.basename(fileName || 'file')).replace(/\.[^/.]+$/, '');
  const hash = crypto.randomBytes(8).toString('hex');
  return `${cleanFolder}/${Date.now()}_${base.slice(0, 40)}_${hash}${ext}`;
}

export async function saveBase64ToMedia(storageKey: string, fileDataBase64: string): Promise<void> {
  const filePath = path.join(MEDIA_ROOT, storageKey);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const normalizedBase64 = fileDataBase64.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(normalizedBase64, 'base64');
  await fs.writeFile(filePath, buffer);
}

export function requireGlobalAdmin(req: AuthedRequest, res: express.Response, next: express.NextFunction): void {
  if (!req.user || req.user.globalRole !== 'admin') {
    res.status(403).json({ error: 'Only admins can access this endpoint' });
    return;
  }
  next();
}

export function requireAuth(req: AuthedRequest, res: express.Response, next: express.NextFunction): void {
  try {
    const header = req.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;
    const token = bearer ?? (req.cookies?.[AUTH_ACCESS_COOKIE_NAME] as string | undefined) ?? null;
    if (!token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const claims = verifyAccessToken(token);
    const globalRole = claims.role ?? 'user';
    req.user = {
      id: claims.sub,
      email: claims.email,
      role: globalRole,
      globalRole,
      name: claims.name,
    };
    (req as AuthedRequest).accessToken = token;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(USER_LIMITS.MIN_PASSWORD_LENGTH),
  name: z.string().min(1).max(USER_LIMITS.MAX_DISPLAY_NAME_LENGTH),
  developerCode: z.string().min(1),
});

export const passwordResetRequestSchema = z.object({ email: z.string().email() });
export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1),
  email: z.string().email(),
  newPassword: z.string().min(USER_LIMITS.MIN_PASSWORD_LENGTH),
});
export const passwordForgotSchema = z.object({
  email: z.string().email(),
  developerCode: z.string().min(1),
});
export const passwordResetSchema = z.object({
  token: z.string().min(1),
  email: z.string().email(),
  newPassword: z.string().min(USER_LIMITS.MIN_PASSWORD_LENGTH),
});

export async function createRefreshSession(
  userId: string,
  refreshToken: string,
  req: express.Request
): Promise<void> {
  const expiresAt = new Date(Date.now() + JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
  await sql`
    insert into sessions (id, user_id, token_hash, ip_address, user_agent, expires_at, created_at)
    values (
      gen_random_uuid(),
      ${userId},
      ${hashToken(refreshToken)},
      ${req.ip ?? null},
      ${String(req.headers['user-agent'] ?? '')},
      ${expiresAt},
      now()
    )
  `;
}

export async function revokeRefreshSession(refreshToken: string): Promise<void> {
  await sql`delete from sessions where token_hash = ${hashToken(refreshToken)}`;
}

export async function revokeAllRefreshSessions(userId: string): Promise<void> {
  await sql`delete from sessions where user_id = ${userId}`;
  await sql`delete from user_sessions where user_id = ${userId}`;
}

export function parseCursorToDate(cursor: string | number | undefined): Date | null {
  if (cursor == null) return null;
  if (typeof cursor === 'number') {
    const d = new Date(cursor);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (!cursor) return null;
  const asNum = Number(cursor);
  if (!Number.isNaN(asNum)) {
    const d = new Date(asNum);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(cursor);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const infra = {
  NODE_ENV,
  PORT,
  CORS_ORIGIN,
  AUTH_REFRESH_COOKIE_NAME,
  AUTH_ACCESS_COOKIE_NAME,
  AUTH_BEARER_ISSUER,
  AUTH_BEARER_AUDIENCE,
  MEDIA_ROOT,
  MEDIA_PUBLIC_BASE_URL,
  LIVEKIT_URL,
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
  LIVEKIT_WEBHOOK_KEY,
  PERM,
  sql,
  redis,
  setupAppMiddleware,
  requireAuth,
  requireGlobalAdmin,
  hasPerm,
  toPermissionFlags,
  defaultMemberPermissions,
  ownerPermissions,
  getServerPermissionBits,
  getChannelPermissionBits,
  getChannelPermissionBitsForMany,
  CHANNELS_LIST_MAX_LIMIT,
  ensureServerMember,
  isServerMember,
  publishRealtime,
  sanitizePathSegment,
  buildStorageKey,
  saveBase64ToMedia,
  hashToken,
  createAccessToken,
  createRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  setRefreshCookie,
  setAccessCookie,
  clearRefreshCookie,
  clearAccessCookie,
  createRefreshSession,
  revokeRefreshSession,
  revokeAllRefreshSessions,
  parseCursorToDate,
  loginSchema,
  registerSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  passwordForgotSchema,
  passwordResetSchema,
} as const;
