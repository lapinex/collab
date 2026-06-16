/**
 * Link embeds: extract URL from message content, fetch og metadata, cache in Redis.
 * Key: embed:${normalizedUrl} (or hash if URL too long). TTL 24h.
 */
import 'server-only';
import { createHash } from 'crypto';
import { cacheKeys, redisGetJSON, redisSetJSON, TTL } from '@/lib/server/redis/client';
import type { Embed } from '@/lib/messages/dto';

const FETCH_TIMEOUT_MS = 5000;
const MAX_HTML_BYTES = 300_000; // ~300KB
const URL_REGEX =
  /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&/=]*)/gi;

/** Extract first URL from content (for async embed queue). */
export function extractFirstUrl(text: string): string | null {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(URL_REGEX);
  return match?.[0] ?? null;
}

function embedCacheKey(url: string): string {
  const normalized = url.trim();
  const hash = createHash('sha256').update(normalized).digest('hex');
  return cacheKeys.embed(hash);
}

function parseOgMeta(html: string): Omit<Embed, 'url'> {
  const result: Omit<Embed, 'url'> = {
    title: null,
    description: null,
    image: null,
    siteName: null,
  };
  const metaRegex =
    /<meta\s+(?:property|name)=["'](?:og:)?(title|description|image|site_name)["']\s+content=["']([^"']*)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = metaRegex.exec(html)) !== null) {
    const key = m[1]!.toLowerCase();
    const value = m[2]?.trim() ?? '';
    if (key === 'title') result.title = value || null;
    else if (key === 'description') result.description = value || null;
    else if (key === 'image') result.image = value || null;
    else if (key === 'site_name') result.siteName = value || null;
  }
  return result;
}

async function fetchEmbedMetadata(url: string): Promise<Embed | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; CollabBot/1.0; +https://github.com/collab)',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('text/html')) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_HTML_BYTES) return null;
    const html = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    const meta = parseOgMeta(html);
    const embed: Embed = {
      url,
      title: meta.title,
      description: meta.description,
      image: meta.image,
      siteName: meta.siteName,
    };
    return embed;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

/**
 * Get embed for a single URL: Redis first, then fetch and cache.
 */
export async function getEmbedForUrl(url: string): Promise<Embed | null> {
  const key = embedCacheKey(url);
  const cached = await redisGetJSON<Embed>(key);
  if (cached && cached.url) return cached;
  const embed = await fetchEmbedMetadata(url);
  if (embed) await redisSetJSON(key, embed, TTL.EMBED);
  return embed;
}

/**
 * Extract first URL from content and return one embed (or none).
 */
export async function getEmbedsForContent(content: string): Promise<Embed[]> {
  const url = extractFirstUrl(content);
  if (!url) return [];
  const embed = await getEmbedForUrl(url);
  return embed ? [embed] : [];
}
