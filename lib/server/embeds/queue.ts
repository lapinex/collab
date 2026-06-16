/**
 * Async embed queue: enqueue job after message create; worker fetches embed and broadcasts message:update.
 */
import 'server-only';
import { getRedis } from '@/lib/server/redis/client';
import { cacheKeys } from '@/lib/server/redis/client';

export interface EmbedJobPayload {
  messageId: string;
  channelId: string;
  url: string;
  isDm: boolean;
}

const EMBED_QUEUE_KEY = cacheKeys.embedQueue();

export async function enqueueEmbedJob(payload: EmbedJobPayload): Promise<void> {
  try {
    const r = getRedis();
    await r.lpush(EMBED_QUEUE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.error('[embeds/queue] enqueueEmbedJob error:', error);
  }
}

/**
 * Pop one job from the queue (FIFO). Returns null if queue empty.
 */
export async function popEmbedJob(): Promise<EmbedJobPayload | null> {
  try {
    const r = getRedis();
    const raw = await r.rpop(EMBED_QUEUE_KEY);
    if (raw == null) return null;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (
      typeof parsed?.messageId === 'string' &&
      typeof parsed?.channelId === 'string' &&
      typeof parsed?.url === 'string' &&
      typeof parsed?.isDm === 'boolean'
    ) {
      return parsed as EmbedJobPayload;
    }
    return null;
  } catch (error) {
    console.error('[embeds/queue] popEmbedJob error:', error);
    return null;
  }
}
