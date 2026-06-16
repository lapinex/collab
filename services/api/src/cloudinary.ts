import crypto from 'node:crypto';

const CLOUD_NAME = (process.env.CLOUDINARY_CLOUD_NAME ?? '').trim();
const API_KEY = (process.env.CLOUDINARY_API_KEY ?? '').trim();
const API_SECRET = (process.env.CLOUDINARY_API_SECRET ?? '').trim();

export function isCloudinaryConfigured(): boolean {
  return Boolean(CLOUD_NAME && API_KEY && API_SECRET);
}

export interface CloudinaryUploadParams {
  uploadUrl: string;
  api_key: string;
  timestamp: string;
  signature: string;
  public_id?: string;
  folder?: string;
  resource_type: 'image' | 'video';
}

/**
 * Generate signed upload params for Cloudinary so the client can POST the file directly.
 * See: https://cloudinary.com/documentation/authentication_signatures
 */
export function getCloudinaryUploadParams(
  publicId: string,
  folder: string,
  resourceType: 'image' | 'video' = 'image'
): CloudinaryUploadParams | null {
  if (!CLOUD_NAME || !API_KEY || !API_SECRET) return null;

  const timestamp = String(Math.floor(Date.now() / 1000));
  const params: Record<string, string> = {
    timestamp,
    public_id: publicId,
    folder: folder.replace(/\/$/, ''),
  };

  const sortedKeys = Object.keys(params).sort();
  const toSign = sortedKeys.map((k) => `${k}=${params[k]}`).join('&');
  const signature = crypto.createHash('sha1').update(toSign + API_SECRET).digest('hex');

  const uploadUrl =
    resourceType === 'video'
      ? `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`
      : `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

  return {
    uploadUrl,
    api_key: API_KEY,
    timestamp,
    signature,
    public_id: publicId,
    folder: params.folder,
    resource_type: resourceType,
  };
}

/**
 * Delete a resource from Cloudinary by public_id (admin API).
 */
export async function cloudinaryDelete(publicId: string, resourceType: 'image' | 'video' = 'image'): Promise<boolean> {
  if (!CLOUD_NAME || !API_KEY || !API_SECRET) return false;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const params: Record<string, string> = { timestamp, public_id: publicId };
  const sortedKeys = Object.keys(params).sort();
  const toSign = sortedKeys.map((k) => `${k}=${params[k]}`).join('&');
  const signature = crypto.createHash('sha1').update(toSign + API_SECRET).digest('hex');
  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/destroy`;
  const body = new URLSearchParams({
    public_id: publicId,
    signature,
    api_key: API_KEY,
    timestamp,
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  return res.ok;
}
