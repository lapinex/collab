/**
 * Normalize any incoming media payload (gif, sticker, upload) to MediaFile[].
 * Server uses this before saving to DB and before sending to realtime. UI only consumes mediaFiles.
 */

import type { MediaFile, MediaType } from './types';
import { generateId } from '@/lib/utils';

/** Input: upload shape (current API) */
export interface CloudinaryMediaItem {
  url: string;
  public_id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  type?: MediaType;
  width?: number;
  height?: number;
}

/** Input: raw gif URL (e.g. from picker) */
export interface GiphyMediaItem {
  giphy?: string;
  url?: string;
}

/** Input: sticker from server */
export interface StickerMediaItem {
  stickerUrl?: string;
  stickerId?: string;
  url?: string;
}

export type IncomingMediaItem = CloudinaryMediaItem | GiphyMediaItem | StickerMediaItem | { url: string; [k: string]: unknown };

function deriveTypeFromMime(mimeType: string, explicitType?: MediaType): MediaType {
  if (explicitType) return explicitType;
  const m = (mimeType || '').toLowerCase();
  if (m === 'image/gif') return 'gif';
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  return 'file';
}

/**
 * Normalize a single item (giphy URL, sticker, cloudinary/upload object) to MediaFile.
 */
export function normalizeToMediaFile(item: IncomingMediaItem, index: number): MediaFile {
  const anyItem = item as Record<string, unknown>;
  const explicitType = anyItem.type as MediaType | undefined;
  const url = (item as { url?: string }).url;

  // Explicit type from client (e.g. type: 'sticker' or type: 'gif')
  if (explicitType === 'sticker') {
    const u = (item as StickerMediaItem).stickerUrl ?? url ?? '';
    return {
      id: (item as StickerMediaItem).stickerId ?? `sticker_${index}_${generateId().slice(0, 8)}`,
      type: 'sticker',
      url: u,
      mimeType: 'image/png',
    };
  }
  if (explicitType === 'gif' && typeof url === 'string') {
    return {
      id: (item as CloudinaryMediaItem).public_id ?? `gif_${index}_${generateId().slice(0, 8)}`,
      type: 'gif',
      url,
      mimeType: 'image/gif',
    };
  }

  // Giphy: { giphy: "https://..." } or url containing giphy
  const giphyUrl = (item as GiphyMediaItem).giphy ?? url;
  if (typeof giphyUrl === 'string' && (giphyUrl.includes('giphy.com') || giphyUrl.includes('giphy'))) {
    return {
      id: (item as CloudinaryMediaItem).public_id ?? `giphy_${index}_${generateId().slice(0, 8)}`,
      type: 'gif',
      url: giphyUrl,
      mimeType: 'image/gif',
    };
  }

  // Sticker: { stickerUrl, stickerId }
  const stickerUrl = (item as StickerMediaItem).stickerUrl ?? url;
  if (typeof (item as StickerMediaItem).stickerId === 'string' || typeof (item as StickerMediaItem).stickerUrl === 'string') {
    return {
      id: (item as StickerMediaItem).stickerId ?? `sticker_${index}_${generateId().slice(0, 8)}`,
      type: 'sticker',
      url: stickerUrl ?? '',
      mimeType: 'image/png',
    };
  }

  // Upload payload: { url, public_id, fileName, fileSize, mimeType, type?, width?, height? }
  const c = item as CloudinaryMediaItem;
  if (c.url && c.public_id != null) {
    const mime = c.mimeType ?? '';
    const type = deriveTypeFromMime(mime, c.type);
    return {
      id: c.public_id,
      type,
      url: c.url,
      width: c.width,
      height: c.height,
      size: c.fileSize,
      mimeType: c.mimeType || undefined,
    };
  }

  // Fallback: raw url
  if (typeof url === 'string') {
    const mime = (item as { mimeType?: string }).mimeType ?? '';
    const type = deriveTypeFromMime(mime, (item as CloudinaryMediaItem).type);
    return {
      id: (item as CloudinaryMediaItem).public_id ?? generateId(),
      type,
      url,
      size: (item as CloudinaryMediaItem).fileSize,
      mimeType: (item as CloudinaryMediaItem).mimeType || undefined,
    };
  }

  return {
    id: generateId(),
    type: 'file',
    url: '',
    mimeType: undefined,
  };
}

/**
 * Normalize array of incoming media (mixed formats) to MediaFile[].
 */
export function normalizeToMediaFiles(items: IncomingMediaItem[] | undefined | null): MediaFile[] {
  if (!Array.isArray(items) || items.length === 0) return [];
  return items.map((item, i) => normalizeToMediaFile(item, i)).filter((m) => m.url);
}
