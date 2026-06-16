import Redis from 'ioredis';

type SetOptions = { nx?: boolean; ex?: number };

function safeParse<T>(value: string | null): T | null {
  if (value == null) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return value as unknown as T;
  }
}

function serialize(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

class RedisCompat {
  constructor(private readonly client: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return safeParse<T>(raw);
  }

  async set(key: string, value: unknown, options?: SetOptions): Promise<string | null> {
    if (options?.nx && options?.ex) {
      return this.client.set(key, serialize(value), 'EX', options.ex, 'NX');
    }
    if (options?.nx) {
      return this.client.set(key, serialize(value), 'NX');
    }
    if (options?.ex) {
      return this.client.set(key, serialize(value), 'EX', options.ex);
    }
    return this.client.set(key, serialize(value));
  }

  async setex(key: string, ttlSeconds: number, value: unknown): Promise<'OK'> {
    return this.client.setex(key, ttlSeconds, serialize(value));
  }

  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return this.client.del(...keys);
  }

  async exists(key: string): Promise<number> {
    return this.client.exists(key);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<number> {
    return this.client.expire(key, ttlSeconds);
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  async publish(channel: string, message: string): Promise<number> {
    return this.client.publish(channel, message);
  }

  async hincrby(key: string, field: string, increment: number): Promise<number> {
    return this.client.hincrby(key, field, increment);
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    if (fields.length === 0) return 0;
    return this.client.hdel(key, ...fields);
  }

  async hgetall<T extends Record<string, string>>(key: string): Promise<T> {
    return (await this.client.hgetall(key)) as T;
  }

  async lpush(key: string, ...values: string[]): Promise<number> {
    if (values.length === 0) return 0;
    return this.client.lpush(key, ...values);
  }

  async ltrim(key: string, start: number, stop: number): Promise<'OK'> {
    return this.client.ltrim(key, start, stop);
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.lrange(key, start, stop);
  }

  async rpop(key: string): Promise<string | null> {
    return this.client.rpop(key);
  }

  async keys(pattern: string): Promise<string[]> {
    return this.client.keys(pattern);
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    if (members.length === 0) return 0;
    return this.client.sadd(key, ...members);
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    if (members.length === 0) return 0;
    return this.client.srem(key, ...members);
  }

  async smembers(key: string): Promise<string[]> {
    return this.client.smembers(key);
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }
}

let redisInstance: RedisCompat | null = null;

export function getRedis(): RedisCompat {
  if (!redisInstance) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL is required');
    }
    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: false,
    });
    redisInstance = new RedisCompat(client);
  }
  return redisInstance;
}

export const redis = new Proxy({} as RedisCompat, {
  get(_target, prop) {
    const client = getRedis();
    const value = client[prop as keyof RedisCompat];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
}) as RedisCompat;

// --- JSON helpers (all values stored as JSON) ---

export async function redisGetJSON<T>(key: string): Promise<T | null> {
  try {
    const raw = await getRedis().get<string>(key);
    if (raw == null) return null;
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw) as T;
      } catch {
        return raw as unknown as T;
      }
    }
    return raw as T;
  } catch (error) {
    console.error('[Redis] redisGetJSON error:', error);
    return null;
  }
}

export async function redisSetJSON(
  key: string,
  value: unknown,
  ttlSeconds?: number
): Promise<void> {
  try {
    const r = getRedis();
    const payload = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds != null && ttlSeconds > 0) {
      await r.setex(key, ttlSeconds, payload);
    } else {
      await r.set(key, payload);
    }
  } catch (error) {
    console.error('[Redis] redisSetJSON error:', error);
  }
}

export async function redisDel(key: string): Promise<void> {
  try {
    await getRedis().del(key);
  } catch (error) {
    console.error('[Redis] redisDel error:', error);
  }
}

export async function redisExpire(key: string, ttlSeconds: number): Promise<void> {
  try {
    await getRedis().expire(key, ttlSeconds);
  } catch (error) {
    console.error('[Redis] redisExpire error:', error);
  }
}

// --- Badge counters (unread/mentions): INCR, HASH HINCRBY/HDEL/HGETALL sum ---

export async function redisIncr(key: string): Promise<number> {
  try {
    const n = await getRedis().incr(key);
    return typeof n === 'number' ? n : Number(n);
  } catch (error) {
    console.error('[Redis] redisIncr error:', error);
    return 0;
  }
}

export async function redisSet(key: string, value: string | number): Promise<void> {
  try {
    await getRedis().set(key, String(value));
  } catch (error) {
    console.error('[Redis] redisSet error:', error);
  }
}

export async function redisGet(key: string): Promise<string | null> {
  try {
    const v = await getRedis().get<string>(key);
    return v == null ? null : String(v);
  } catch (error) {
    console.error('[Redis] redisGet error:', error);
    return null;
  }
}

export async function redisHincrby(key: string, field: string, increment: number): Promise<number> {
  try {
    const n = await getRedis().hincrby(key, field, increment);
    return typeof n === 'number' ? n : Number(n);
  } catch (error) {
    console.error('[Redis] redisHincrby error:', error);
    return 0;
  }
}

export async function redisHdel(key: string, ...fields: string[]): Promise<number> {
  try {
    if (fields.length === 0) return 0;
    const n = await getRedis().hdel(key, ...fields);
    return typeof n === 'number' ? n : Number(n);
  } catch (error) {
    console.error('[Redis] redisHdel error:', error);
    return 0;
  }
}

/** Returns sum of all values in hash (values parsed as integers). O(channels with unread/mentions). */
export async function redisHgetallSum(key: string): Promise<number> {
  try {
    const obj = await getRedis().hgetall<Record<string, string>>(key);
    if (!obj || typeof obj !== 'object') return 0;
    let sum = 0;
    for (const v of Object.values(obj)) {
      const n = parseInt(String(v), 10);
      if (!Number.isNaN(n)) sum += n;
    }
    return sum;
  } catch (error) {
    console.error('[Redis] redisHgetallSum error:', error);
    return 0;
  }
}

/** Push value to list, trim to maxLength (newest first). Values stored as JSON. */
export async function redisPushList(
  key: string,
  value: unknown,
  maxLength: number
): Promise<void> {
  try {
    const r = getRedis();
    const payload = typeof value === 'string' ? value : JSON.stringify(value);
    await r.lpush(key, payload);
    await r.ltrim(key, 0, maxLength - 1);
  } catch (error) {
    console.error('[Redis] redisPushList error:', error);
  }
}

/** Get full list; elements are parsed from JSON. Returns newest first. */
export async function redisGetList<T>(key: string): Promise<T[]> {
  try {
    const r = getRedis();
    const raw = await r.lrange(key, 0, -1);
    if (!Array.isArray(raw) || raw.length === 0) return [];
    return raw.map((item) => {
      if (typeof item === 'string') {
        try {
          return JSON.parse(item) as T;
        } catch {
          return item as unknown as T;
        }
      }
      return item as T;
    });
  } catch (error) {
    console.error('[Redis] redisGetList error:', error);
    return [];
  }
}

/** Replace list with given items (newest first). Values stored as JSON. */
export async function redisSetList(
  key: string,
  items: unknown[],
  maxLength: number
): Promise<void> {
  try {
    const r = getRedis();
    await r.del(key);
    if (items.length === 0) return;
    const toPush = items.slice(0, maxLength).map((v) =>
      typeof v === 'string' ? v : JSON.stringify(v)
    );
    if (toPush.length > 0) {
      await r.lpush(key, ...toPush);
      await r.ltrim(key, 0, maxLength - 1);
    }
  } catch (error) {
    console.error('[Redis] redisSetList error:', error);
  }
}

/**
 * Update one item in a Redis list by predicate. List order (newest first) preserved.
 * Uses get → modify → set; maxLength must match the list's trim size (e.g. 50 for last messages).
 */
export async function redisUpdateListItem<T extends { id?: string }>(
  key: string,
  predicate: (item: T) => boolean,
  newValue: T,
  maxLength: number
): Promise<boolean> {
  try {
    const list = await redisGetList<T>(key);
    const idx = list.findIndex(predicate);
    if (idx === -1) return false;
    const next = [...list];
    next[idx] = newValue;
    await redisSetList(key, next, maxLength);
    return true;
  } catch (error) {
    console.error('[Redis] redisUpdateListItem error:', error);
    return false;
  }
}

/**
 * Remove one item from a Redis list by predicate. List order preserved.
 */
export async function redisRemoveListItem<T>(
  key: string,
  predicate: (item: T) => boolean,
  maxLength: number
): Promise<boolean> {
  try {
    const list = await redisGetList<T>(key);
    const filtered = list.filter((item) => !predicate(item));
    if (filtered.length === list.length) return false;
    await redisSetList(key, filtered, maxLength);
    return true;
  } catch (error) {
    console.error('[Redis] redisRemoveListItem error:', error);
    return false;
  }
}

/** Delete all keys matching pattern (e.g. "perm:serverId:*"). Use sparingly. */
export async function redisDelByPattern(pattern: string): Promise<number> {
  try {
    const r = getRedis();
    const keys = await r.keys(pattern);
    if (keys.length === 0) return 0;
    await r.del(...keys);
    return keys.length;
  } catch (error) {
    console.error('[Redis] redisDelByPattern error:', error);
    return 0;
  }
}

// Cache helpers
export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const value = await redis.get<T>(key);
    return value;
  } catch (error) {
    console.error('Redis get error:', error);
    return null;
  }
}

export async function setCache<T>(
  key: string,
  value: T,
  ttlSeconds?: number
): Promise<void> {
  try {
    if (ttlSeconds) {
      await redis.setex(key, ttlSeconds, value);
    } else {
      await redis.set(key, value);
    }
  } catch (error) {
    console.error('Redis set error:', error);
  }
}

export async function deleteCache(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch (error) {
    console.error('Redis delete error:', error);
  }
}

export async function existsCache(key: string): Promise<boolean> {
  try {
    const result = await redis.exists(key);
    return result === 1;
  } catch (error) {
    console.error('Redis exists error:', error);
    return false;
  }
}

// Pub/Sub helpers (for WebSocket Gateway)
export async function publish(channel: string, message: unknown): Promise<void> {
  try {
    await redis.publish(channel, JSON.stringify(message));
  } catch (error) {
    console.error('Redis publish error:', error);
  }
}

// Cache key generators
export const cacheKeys = {
  user: (userId: string) => `user:${userId}`,
  session: (sessionId: string) => `session:${sessionId}`,
  message: (messageId: string) => `message:${messageId}`,
  channelMessages: (channelId: string, limit: number, offset: number) =>
    `channel:${channelId}:messages:${limit}:${offset}`,
  permissions: (userId: string, serverId: string, channelId?: string) =>
    channelId
      ? `permissions:${userId}:${serverId}:${channelId}`
      : `permissions:${userId}:${serverId}`,
  /** Permission version: INCR on role/overwrite/owner/category change. Key includes :v${version}. */
  permVersion: (serverId: string) => `server:permVersion:${serverId}`,
  /** Permission cache key: perm:{serverId}:{channelId}:{userId}:v{version}. Version from permVersion. */
  perm: (serverId: string, channelId: string | undefined, userId: string, version: number) =>
    `perm:${serverId}:${channelId ?? ''}:${userId}:v${version}`,
  /** Pattern to invalidate all permission keys for a server (use with redisDelByPattern). */
  permServerPattern: (serverId: string) => `perm:${serverId}:*`,
  /** Per-user channel list (ViewChannel filtered). Versioned: old keys become stale when permVersion increments. */
  channelsView: (serverId: string, userId: string, version: number) =>
    `server:channelsView:${serverId}:${userId}:v${version}`,
  /** Pattern to invalidate all user channel lists for a server (channels/permissions changed). */
  userChannelsPattern: (serverId: string) => `user:channels:*:${serverId}`,
  /** Raw channel list for server (system cache). Filter by ViewChannel in API. */
  serverChannels: (serverId: string) => `server:channels:${serverId}`,
  /** Last N messages for a server channel. */
  channelLast: (channelId: string) => `channel:last:${channelId}`,
  /** Last N messages for a DM channel. */
  dmLast: (dmId: string) => `dm:last:${dmId}`,
  /** Filtered channel list for user on server (ViewChannel). */
  userChannels: (userId: string, serverId: string) =>
    `user:channels:${userId}:${serverId}`,
  /** Server members list (id, roles, nick, avatar). */
  serverMembers: (serverId: string) => `server:members:${serverId}`,
  translate: (lang: string, hash: string) => `translate:${lang}:${hash}`,
  /** Legacy: full presence payload (JSON). Prefer presenceUser for status. */
  presence: (userId: string) => `presence:${userId}`,
  /** Presence status only: online | idle | dnd | offline. TTL 60s (heartbeat). */
  presenceUser: (userId: string) => `presence:user:${userId}`,
  /** Set of userId currently online on this server. */
  presenceServer: (serverId: string) => `presence:server:${serverId}`,
  /** Set of online userIds (global; optional). */
  presenceOnlineUserIds: () => 'presence:online:users',
  /** Typing indicator: typing:{channelId}:{userId} */
  typing: (channelId: string, userId: string) =>
    `typing:${channelId}:${userId}`,
  /** Pattern to list all typing keys for a channel (for GET typers). */
  typingChannelPattern: (channelId: string) => `typing:${channelId}:*`,
  /** Server invites list (TTL 60s). */
  serverInvites: (serverId: string) => `server:invites:${serverId}`,
  /** Server audit log first page (TTL 30s). */
  serverAudit: (serverId: string, cursor?: string) =>
    cursor ? `server:audit:${serverId}:${cursor}` : `server:audit:${serverId}:first`,
  /** User account settings (allow_dm, voice, etc). TTL 600s. */
  userSettings: (userId: string) => `user:settings:${userId}`,
  /** Friends list. TTL 300s. */
  friends: (userId: string) => `friends:${userId}`,
  /** Friend requests (incoming + outgoing). TTL 300s. */
  friendRequests: (userId: string) => `friend:requests:${userId}`,
  /** Link embed metadata by URL. TTL 24h. */
  embed: (url: string) => `embed:${url}`,
  /** Queue for async embed jobs: messageId, channelId, url, isDm. */
  embedQueue: () => 'embed:queue',
  /** Distributed lock: only one embed worker runs cluster-wide. SET NX EX 10. */
  embedWorkerLock: () => 'embed:worker:lock',
  /** Idempotent embed job: one message processed at most once. TTL 60s. */
  embedJobProcessing: (messageId: string) => `embed:job:processing:${messageId}`,
  /** Distributed lock: only one presence sweeper runs cluster-wide. SET NX EX 120. */
  presenceSweeperLock: () => 'presence:sweeper:lock',

  /** Badge: unread count per channel per user. Integer. */
  unreadChannel: (channelId: string, userId: string) => `unread:channel:${channelId}:${userId}`,
  /** Badge: mention count per channel per user. Integer. */
  mentionsChannel: (channelId: string, userId: string) => `mentions:channel:${channelId}:${userId}`,
  /** Badge: unread per server per user. HASH: field = channelId, value = count. */
  unreadServer: (serverId: string, userId: string) => `unread:server:${serverId}:${userId}`,
  /** Badge: mentions per server per user. HASH: field = channelId, value = count. */
  mentionsServer: (serverId: string, userId: string) => `mentions:server:${serverId}:${userId}`,
  /** Badge: unread per DM channel per user. Integer. */
  unreadDm: (dmChannelId: string, userId: string) => `unread:dm:${dmChannelId}:${userId}`,
};

// TTL constants (in seconds)
export const TTL = {
  USER: 3600, // 1 hour
  SESSION: 604800, // 7 days
  MESSAGE: 3600, // 1 hour
  CHANNEL_MESSAGES: 300, // 5 minutes
  /** Permission cache: 30 minutes (reduce DB hits). */
  PERMISSIONS: 1800,
  /** Channel permission cache: 6 hours (heavy resolution, invalidated on role/overwrite change). */
  PERMISSIONS_CHANNEL: 21600,
  TRANSLATE: 86400, // 24 hours
  PRESENCE: 300, // 5 minutes
  /** Presence status key TTL (heartbeat refresh). */
  PRESENCE_STATUS: 60,
  /** Presence user key TTL (same as heartbeat). */
  PRESENCE_USER_TTL: 60,
  /** Typing indicator TTL. */
  TYPING: 5,
  /** User channels list cache. */
  USER_CHANNELS: 1800,
  /** Server members cache. */
  SERVER_MEMBERS: 1800,
  /** Server channels list (raw). */
  SERVER_CHANNELS: 3600,
  /** Per-user channels view (filtered by ViewChannel). 15 min. */
  CHANNELS_VIEW: 900,
  /** Channel/DM last messages list (10 min). */
  CHANNEL_LAST_MESSAGES: 600,
  /** Server invites list. */
  SERVER_INVITES: 60,
  /** Server audit log first page. */
  SERVER_AUDIT: 30,
  /** User account settings cache. */
  USER_SETTINGS: 600,
  /** Friends and friend requests cache. */
  FRIENDS: 300,
  FRIEND_REQUESTS: 300,
  /** Link embed metadata cache. */
  EMBED: 86400, // 24 hours
};
