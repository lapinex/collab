import { describe, it, expect } from '@jest/globals';
import {
  normalizeToMediaFile,
  normalizeToMediaFiles,
} from '@/lib/media/normalize';

describe('normalizeToMediaFile', () => {
  it('derives "image" from a cloudinary upload mime type', () => {
    const result = normalizeToMediaFile(
      {
        url: 'https://res.cloudinary.com/demo/image/upload/pic.png',
        public_id: 'pic',
        fileName: 'pic.png',
        fileSize: 1234,
        mimeType: 'image/png',
      },
      0
    );
    expect(result).toMatchObject({
      id: 'pic',
      type: 'image',
      url: 'https://res.cloudinary.com/demo/image/upload/pic.png',
      size: 1234,
      mimeType: 'image/png',
    });
  });

  it('derives "gif", "video" and "file" from the mime type', () => {
    const common = { public_id: 'x', fileName: 'f', fileSize: 1 };
    expect(
      normalizeToMediaFile({ ...common, url: 'u', mimeType: 'image/gif' }, 0).type
    ).toBe('gif');
    expect(
      normalizeToMediaFile({ ...common, url: 'u', mimeType: 'video/mp4' }, 0).type
    ).toBe('video');
    expect(
      normalizeToMediaFile({ ...common, url: 'u', mimeType: 'application/pdf' }, 0).type
    ).toBe('file');
  });

  it('honours an explicit sticker payload', () => {
    const result = normalizeToMediaFile(
      { type: 'sticker', stickerId: 'st1', stickerUrl: 'https://cdn/s.png' },
      0
    );
    expect(result).toEqual({
      id: 'st1',
      type: 'sticker',
      url: 'https://cdn/s.png',
      mimeType: 'image/png',
    });
  });

  it('classifies a Giphy url as a gif', () => {
    const result = normalizeToMediaFile(
      { giphy: 'https://media.giphy.com/media/abc/giphy.gif' },
      0
    );
    expect(result.type).toBe('gif');
    expect(result.url).toBe('https://media.giphy.com/media/abc/giphy.gif');
    expect(result.mimeType).toBe('image/gif');
  });

  it('falls back to a raw url and still derives the type from mime', () => {
    const result = normalizeToMediaFile(
      { url: 'https://example.com/clip.mp4', mimeType: 'video/mp4' },
      0
    );
    expect(result.type).toBe('video');
    expect(result.url).toBe('https://example.com/clip.mp4');
    expect(typeof result.id).toBe('string');
    expect(result.id.length).toBeGreaterThan(0);
  });
});

describe('normalizeToMediaFiles', () => {
  it('returns [] for null, undefined or empty input', () => {
    expect(normalizeToMediaFiles(null)).toEqual([]);
    expect(normalizeToMediaFiles(undefined)).toEqual([]);
    expect(normalizeToMediaFiles([])).toEqual([]);
  });

  it('drops items that normalize to an empty url', () => {
    expect(normalizeToMediaFiles([{ url: '' }])).toEqual([]);
  });

  it('normalizes a mixed array preserving order and types', () => {
    const result = normalizeToMediaFiles([
      {
        url: 'https://res.cloudinary.com/demo/image/upload/a.png',
        public_id: 'a',
        fileName: 'a.png',
        fileSize: 10,
        mimeType: 'image/png',
      },
      { giphy: 'https://media.giphy.com/x/giphy.gif' },
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.type)).toEqual(['image', 'gif']);
  });
});
