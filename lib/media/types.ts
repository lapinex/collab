/**
 * Single standard for media in messages. Server and UI use only this shape.
 */

export type MediaType = 'image' | 'video' | 'gif' | 'sticker' | 'file';

export interface MediaFile {
  id: string;
  type: MediaType;
  url: string;
  width?: number;
  height?: number;
  size?: number;
  mimeType?: string;
}
