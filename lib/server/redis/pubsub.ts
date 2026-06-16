import { Redis, type RedisOptions } from 'ioredis';

/**
 * Redis TCP clients for pub/sub (Upstash-friendly).
 *
 * Goals:
 * - Explicitly support Upstash (rediss:// + tls).
 * - Redis is OPTIONAL: if unavailable, gateway must keep working.
 * - Respect DISABLE_REDIS=true: do not initialize or connect at all.
 * - No side-effects on import; all connections are lazy and initiated via initPubSub().
 * - After N errors, permanently disable Redis to avoid reconnect-spam.
 */

// ----------------------------
// Config / state
// ----------------------------
const MAX_ERRORS_BEFORE_DISABLE = 5;
const MAX_RECONNECT_ATTEMPTS = 5;
const CONNECT_ATTEMPT_TIMEOUT_MS = 1500;

let publisher: Redis | null = null;
let subscriber: Redis | null = null;

let publisherReady = false;
let subscriberReady = false;

let initStarted = false;
let initDone = false;

let errorCount = 0;
let permanentlyDisabled = false;

// "fallback" = single-instance mode (no cross-instance pub/sub)
let fallbackMode = false;

let loggedDisabledByConfig = false;
let loggedMissingUrl = false;
let loggedBadUrl = false;
let loggedDisableAfterErrors = false;
let loggedFirstError = false;

function parseBoolEnv(value: string | undefined): boolean {
  if (!value) return false;
  return value === '1' || value.toLowerCase() === 'true' || value.toLowerCase() === 'yes';
}

function getRedisTcpUrl(): string | null {
  return process.env.WS_REDIS_URL || process.env.REDIS_URL || null;
}

export function isRedisEnabled(): boolean {
  if (permanentlyDisabled) return false;
  if (parseBoolEnv(process.env.DISABLE_REDIS)) return false;
  const url = getRedisTcpUrl();
  if (!url) return false;
  // Upstash REST URL is not compatible with ioredis pub/sub
  if (url.startsWith('https://')) return false;
  return true;
}

function isUpstashUrl(redisUrl: string): boolean {
  return redisUrl.startsWith('rediss://') || redisUrl.includes('upstash.io');
}

function createRedisOptions(redisUrl: string): RedisOptions {
  const upstash = isUpstashUrl(redisUrl);

  const opts: RedisOptions = {
    // required for Upstash stability
    enableReadyCheck: false,
    lazyConnect: true,

    // reduce reconnect aggressiveness + stop after N attempts
    maxRetriesPerRequest: 1,
    retryStrategy: (times: number) => {
      if (times > MAX_RECONNECT_ATTEMPTS) return null;
      return Math.min(times * 1000, 5000);
    },
  };

  if (upstash) {
    // Upstash requires TLS. Using rediss:// is expected.
    opts.tls = {};
  }

  return opts;
}

function markUnavailable(): void {
  publisherReady = false;
  subscriberReady = false;
}

function permanentlyDisable(reason: string, err?: unknown): void {
  permanentlyDisabled = true;
  fallbackMode = true;
  markUnavailable();

  // Stop reconnections immediately
  try {
    subscriber?.disconnect();
  } catch {
    // ignore
  }
  try {
    publisher?.disconnect();
  } catch {
    // ignore
  }

  subscriber = null;
  publisher = null;

  if (!loggedDisableAfterErrors) {
    loggedDisableAfterErrors = true;
    console.warn(
      '[Gateway] Redis permanently disabled (single-instance mode)',
      err instanceof Error ? `- ${err.message}` : '',
      `- reason: ${reason}`
    );
  }
}

function bumpError(source: string, err?: unknown): void {
  errorCount += 1;
  fallbackMode = true;
  markUnavailable();

  if (!loggedFirstError) {
    loggedFirstError = true;
    console.warn(
      `[Gateway] Redis error (${source}) → single-instance mode`,
      err instanceof Error ? `- ${err.message}` : ''
    );
  }

  if (errorCount >= MAX_ERRORS_BEFORE_DISABLE) {
    permanentlyDisable(`too many redis errors (${errorCount})`, err);
  }
}

function attachClientHandlers(client: Redis, role: 'publisher' | 'subscriber'): void {
  client.on('error', (err: unknown) => bumpError(`${role}:error`, err));
  client.on('close', () => bumpError(`${role}:close`));
  client.on('end', () => bumpError(`${role}:end`));

  client.on('ready', () => {
    if (permanentlyDisabled) return;
    if (role === 'publisher') publisherReady = true;
    if (role === 'subscriber') subscriberReady = true;
    fallbackMode = false;
  });
}

async function connectWithTimeout(client: Redis): Promise<void> {
  const timeout = new Promise<void>((resolve) => {
    setTimeout(resolve, CONNECT_ATTEMPT_TIMEOUT_MS);
  });

  try {
    await Promise.race([client.connect().then(() => undefined), timeout]);
  } catch (err: unknown) {
    bumpError('connect', err);
  }
}

// ----------------------------
// Public API (required exports)
// ----------------------------
export async function initPubSub(): Promise<void> {
  if (initDone || initStarted) return;
  initStarted = true;

  if (parseBoolEnv(process.env.DISABLE_REDIS)) {
    fallbackMode = true;
    if (!loggedDisabledByConfig) {
      loggedDisabledByConfig = true;
      console.log('[Gateway] Redis disabled by config');
    }
    initDone = true;
    return;
  }

  const redisUrl = getRedisTcpUrl();
  if (!redisUrl) {
    fallbackMode = true;
    if (!loggedMissingUrl) {
      loggedMissingUrl = true;
      console.warn('[Gateway] Redis not configured → single-instance mode');
    }
    initDone = true;
    return;
  }

  if (redisUrl.startsWith('https://')) {
    fallbackMode = true;
    if (!loggedBadUrl) {
      loggedBadUrl = true;
      console.warn(
        '[Gateway] Redis URL looks like Upstash REST (https://). Pub/Sub requires redis:// or rediss:// → single-instance mode'
      );
    }
    initDone = true;
    return;
  }

  if (permanentlyDisabled) {
    initDone = true;
    return;
  }

  const opts = createRedisOptions(redisUrl);

  // Create clients lazily; no connection attempt happens until connect()/a command.
  publisher = new Redis(redisUrl, opts);
  subscriber = publisher.duplicate();

  attachClientHandlers(publisher, 'publisher');
  attachClientHandlers(subscriber, 'subscriber');

  // Try to connect, but never block gateway startup.
  await Promise.all([connectWithTimeout(publisher), connectWithTimeout(subscriber)]);

  initDone = true;
}

export function getSubscriber(): Redis | null {
  if (!initDone) return null;
  if (!isRedisEnabled()) return null;
  return subscriber;
}

export function isRedisAvailable(): boolean {
  return !permanentlyDisabled && !fallbackMode && publisherReady && subscriberReady;
}

// ----------------------------
// Back-compat exports (used by gateway handlers)
// ----------------------------
export function getPubSubRedis(): Redis {
  return getPubSubPublisher();
}

export function getPubSubPublisher(): Redis {
  if (!publisher) {
    throw new Error('Redis pub/sub publisher is not initialized');
  }
  return publisher;
}

export function getPubSubSubscriber(): Redis {
  const sub = getSubscriber();
  if (!sub) {
    throw new Error('Redis pub/sub subscriber is not initialized');
  }
  return sub;
}

export function isFallbackMode(): boolean {
  return fallbackMode || permanentlyDisabled;
}

export async function closePubSubRedis(): Promise<void> {
  // Intentional: do not throw from shutdown/cleanup
  try {
    await subscriber?.quit();
  } catch {
    try {
      subscriber?.disconnect();
    } catch {
      // ignore
    }
  } finally {
    subscriber = null;
    subscriberReady = false;
  }

  try {
    await publisher?.quit();
  } catch {
    try {
      publisher?.disconnect();
    } catch {
      // ignore
    }
  } finally {
    publisher = null;
    publisherReady = false;
  }
}

// Safe publish function that handles Redis unavailability (no crash, no spam)
export async function safePublish(channel: string, message: string): Promise<boolean> {
  if (!isRedisEnabled()) return false;
  if (permanentlyDisabled) return false;

  if (!initDone) {
    await initPubSub();
  }

  if (!publisher || !isRedisAvailable()) {
    return false;
  }

  try {
    await publisher.publish(channel, message);
    return true;
  } catch (err) {
    bumpError('publish', err);
    return false;
  }
}

// Pub/Sub channels
export const channels = {
  messages: (channelId: string) => `messages:${channelId}`,
  typing: (channelId: string) => `typing:${channelId}`,
  presence: (userId: string) => `presence:${userId}`,
  server: (serverId: string) => `server:${serverId}`,
  voice: (channelId: string) => `voice:${channelId}`,
};
