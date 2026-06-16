/**
 * Client-side media upload: presigned (request-upload → Cloudinary → confirm-upload)
 * with fallback to unsigned Cloudinary or upload-direct.
 */

import type {
  MediaUploadRequest,
  MediaUploadResponse,
  MediaFile,
} from '@/types/media';

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? '';
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? '';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;
const GENERIC_CONTENT_TYPES = new Set([
  '',
  'application/octet-stream',
  'binary/octet-stream',
]);
const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  gif: 'image/gif',
  avi: 'video/x-msvideo',
  m4v: 'video/mp4',
  mkv: 'video/x-matroska',
  mov: 'video/quicktime',
  mp4: 'video/mp4',
  ogv: 'video/ogg',
  webm: 'video/webm',
};

function normalizeContentType(file: Pick<File, 'name' | 'type'>): string {
  const rawType = file.type.trim();
  const normalizedType = rawType.toLowerCase();
  if (!GENERIC_CONTENT_TYPES.has(normalizedType)) {
    return rawType;
  }

  const extension = file.name.split('.').pop()?.trim().toLowerCase();
  if (extension && EXTENSION_CONTENT_TYPES[extension]) {
    return EXTENSION_CONTENT_TYPES[extension];
  }

  return 'application/octet-stream';
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(CLOUD_NAME && UPLOAD_PRESET);
}

export interface CloudinaryUploadResult {
  url: string;
  public_id: string;
  secure_url?: string;
}

export async function uploadToCloudinary(
  file: File
): Promise<CloudinaryUploadResult> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error('Cloudinary is not configured');
  }
  const contentType = normalizeContentType(file);
  const resourceType = contentType.startsWith('video/') ? 'video' : 'image';
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);

  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`;
  const res = await fetch(url, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Cloudinary upload failed: ${res.status}`);
  }
  const data = (await res.json()) as { secure_url?: string; url?: string; public_id?: string };
  const finalUrl = data.secure_url ?? data.url ?? '';
  const publicId = data.public_id ?? '';
  if (!finalUrl) throw new Error('Invalid Cloudinary response');
  return {
    url: finalUrl,
    public_id: publicId,
    secure_url: finalUrl,
  };
}

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
  signal?: AbortSignal
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < retries; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < retries - 1) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (i + 1)));
      }
    }
  }
  throw lastErr;
}

/**
 * Request presigned upload params from API. Returns 503 if presigned is not configured.
 */
export async function requestUpload(
  options: MediaUploadRequest,
  signal?: AbortSignal
): Promise<MediaUploadResponse> {
  const res = await fetch('/api/media/request-upload', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: options.fileName,
      fileSize: options.fileSize,
      contentType: options.contentType,
      folder: options.folder ?? 'chat',
      isSticker: options.isSticker ?? false,
      isEmoji: options.isEmoji ?? false,
      serverId: options.serverId ?? undefined,
    }),
    signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 503) {
      throw new Error(data?.message ?? data?.error ?? 'Presigned upload not configured');
    }
    throw new Error(data?.error ?? `Request upload failed: ${res.status}`);
  }
  const data = (await res.json()) as MediaUploadResponse & { params?: Record<string, string> };
  return {
    uploadUrl: data.uploadUrl,
    mediaId: data.mediaId,
    publicId: data.publicId,
    expiresAt: data.expiresAt,
    params: data.params,
  };
}

/**
 * Confirm upload after client has uploaded file to storage; returns saved MediaFile.
 */
export async function confirmUpload(
  mediaId: string,
  publicId: string,
  url: string,
  signal?: AbortSignal
): Promise<MediaFile> {
  const res = await fetch('/api/media/confirm-upload', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mediaId, publicId, url }),
    signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error ?? `Confirm upload failed: ${res.status}`);
  }
  const data = (await res.json()) as MediaFile;
  return data;
}

/**
 * Full flow: request-upload → POST file to Cloudinary → confirm-upload.
 * On 503 or missing params, falls back to upload-direct or unsigned Cloudinary and
 * returns a MediaFile-like shape (no confirm step for fallback).
 */
export async function uploadMediaFile(
  file: File,
  options: {
    folder?: 'avatars' | 'stickers' | 'emojis' | 'chat';
    isSticker?: boolean;
    isEmoji?: boolean;
    serverId?: string;
    signal?: AbortSignal;
  } = {}
): Promise<MediaFile> {
  const { folder = 'chat', isSticker, isEmoji, serverId, signal } = options;
  const contentType = normalizeContentType(file);
  const request: MediaUploadRequest = {
    fileName: file.name || 'file',
    fileSize: file.size,
    contentType,
    folder,
    isSticker,
    isEmoji,
    serverId,
  };

  return withRetry(async () => {
    let response: MediaUploadResponse;
    try {
      response = await requestUpload(request, signal);
    } catch (e) {
      if (e instanceof Error && e.message.includes('not configured')) {
        return fallbackUpload(file, folder, signal);
      }
      throw e;
    }

    if (!response.params || !response.uploadUrl) {
      return fallbackUpload(file, folder, signal);
    }

    const formData = new FormData();
    formData.append('file', file);
    for (const [k, v] of Object.entries(response.params)) {
      if (v != null) formData.append(k, String(v));
    }

    const uploadRes = await fetch(response.uploadUrl, {
      method: 'POST',
      body: formData,
      signal,
    });
    if (!uploadRes.ok) {
      const err = await uploadRes.json().catch(() => ({}));
      throw new Error((err as { error?: { message?: string } })?.error?.message ?? `Upload failed: ${uploadRes.status}`);
    }
    const cloudData = (await uploadRes.json()) as { secure_url?: string; url?: string; public_id?: string };
    const finalUrl = cloudData.secure_url ?? cloudData.url ?? '';
    const publicId = cloudData.public_id ?? response.publicId;
    if (!finalUrl) throw new Error('Invalid Cloudinary response');

    return confirmUpload(response.mediaId, publicId, finalUrl, signal);
  }, MAX_RETRIES, signal);
}

/**
 * Fallback: unsigned Cloudinary if configured, else upload-direct (base64).
 */
async function fallbackUpload(
  file: File,
  folder: string,
  signal?: AbortSignal
): Promise<MediaFile> {
  const contentType = normalizeContentType(file);
  if (CLOUD_NAME && UPLOAD_PRESET) {
    const result = await uploadToCloudinary(file);
    const url = result.secure_url ?? result.url;
    return {
      id: '',
      url,
      publicId: result.public_id,
      fileName: file.name || 'file',
      fileSize: file.size,
      mimeType: contentType,
      createdAt: new Date().toISOString(),
      uploadedBy: '',
    };
  }

  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Failed to read file as base64'));
        return;
      }
      const raw = reader.result.split(',')[1];
      if (!raw) reject(new Error('Failed to extract file data'));
      else resolve(raw);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

  const res = await fetch('/api/media/upload-direct', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name || 'file',
      fileSize: file.size,
      contentType,
      fileData: base64,
      folder,
    }),
    signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string })?.error ?? `Upload failed: ${res.status}`);
  }
  const data = (await res.json()) as {
    url: string;
    public_id: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    file?: { id: string; createdAt: string; userId: string };
  };
  return {
    id: data.file?.id ?? '',
    url: data.url,
    publicId: data.public_id,
    fileName: data.fileName,
    fileSize: data.fileSize,
    mimeType: data.mimeType,
    createdAt: data.file?.createdAt ?? new Date().toISOString(),
    uploadedBy: data.file?.userId ?? '',
  };
}
