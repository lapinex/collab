/**
 * Map DB media_files row to unified MediaFile. Use for API/realtime output.
 */

import type { MediaFile, MediaType } from './types';

export interface MediaFileRow {
  id: string;
  cdnUrl: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  mediaType?: string | null;
}

function deriveTypeFromMime(mimeType: string): MediaType {
  const m = (mimeType || '').toLowerCase();
  if (m === 'image/gif') return 'gif';
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  return 'file';
}

export function mediaRowToMediaFile(row: MediaFileRow): MediaFile | null {
  const url = row.cdnUrl ?? null;
  if (!url) return null;
  const type = (row.mediaType as MediaType | undefined) ?? deriveTypeFromMime(row.mimeType ?? '');
  return {
    id: row.id,
    type: type || 'file',
    url,
    size: row.fileSize ?? undefined,
    mimeType: row.mimeType ?? undefined,
  };
}

export function mediaRowsToMediaFiles(rows: MediaFileRow[] | undefined | null): MediaFile[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return rows.map(mediaRowToMediaFile).filter((m): m is MediaFile => m != null);
}
