/**
 * Types for presigned media upload and MediaFile DTO.
 */

export interface MediaUploadRequest {
  fileName: string;
  fileSize: number;
  contentType: string;
  folder?: 'avatars' | 'stickers' | 'emojis' | 'chat';
  isSticker?: boolean;
  isEmoji?: boolean;
  serverId?: string;
}

export interface MediaUploadResponse {
  uploadUrl: string;
  mediaId: string;
  publicId: string;
  expiresAt: string;
  /** Cloudinary: signature, timestamp, api_key, etc. for client POST */
  params?: Record<string, string>;
}

export interface MediaConfirmRequest {
  mediaId: string;
  publicId: string;
  url?: string;
}

export interface MediaFile {
  id: string;
  url: string;
  publicId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  width?: number;
  height?: number;
  duration?: number;
  createdAt: string;
  uploadedBy: string;
}
