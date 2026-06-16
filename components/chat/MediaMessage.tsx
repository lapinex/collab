'use client';

import Image from 'next/image';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { MediaFile } from '@/lib/media/types';
import { MediaFullscreenModal } from './MediaFullscreenModal';
import {
  readMediaViewerSession,
  saveMediaViewerSession,
  clearMediaViewerSession,
} from '@/lib/media/viewerSession';

interface MediaMessageProps {
  files: MediaFile[];
  className?: string;
}

function isImageType(f: MediaFile): boolean {
  return f.type === 'image' || f.type === 'gif' || f.type === 'sticker';
}

function isVideoType(f: MediaFile): boolean {
  return f.type === 'video';
}

export function MediaMessage({ files, className }: MediaMessageProps) {
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [fullscreenMedia, setFullscreenMedia] = useState<MediaFile | null>(null);

  useEffect(() => {
    const saved = readMediaViewerSession();
    if (!saved) return;
    const existing = files.find((f) => f.url === saved.url) ?? null;
    if (existing) {
      setFullscreenMedia(existing);
    }
  }, [files]);

  useEffect(() => {
    if (fullscreenMedia) {
      const type =
        fullscreenMedia.type === 'gif'
          ? 'gif'
          : fullscreenMedia.type === 'video'
          ? 'video'
          : 'image';
      saveMediaViewerSession({ url: fullscreenMedia.url, type });
    } else {
      clearMediaViewerSession();
    }
  }, [fullscreenMedia]);

  if (!files?.length) return null;

  const onImageError = (id: string) => {
    setImageErrors((prev) => new Set(prev).add(id));
  };

  if (files.length === 1) {
    const f = files[0]!;
    const url = f.url;
    if (!url) return null;

    if (isImageType(f) && !imageErrors.has(f.id)) {
      return (
        <>
          <div className={cn('mt-2 max-w-md pointer-events-none', className)}>
            <button
              type="button"
              onClick={() => setFullscreenMedia(f)}
              className="relative block rounded-lg overflow-hidden border border-border-primary hover:opacity-90 transition-all hover:scale-[1.01] cursor-pointer pointer-events-auto min-h-[200px] aspect-video"
            >
              <Image
                src={url}
                alt=""
                fill
                className="object-contain"
                sizes="(max-width: 28rem) 100vw, 28rem"
                unoptimized
                onError={() => onImageError(f.id)}
              />
            </button>
          </div>
          {fullscreenMedia && (
            <MediaFullscreenModal
              media={fullscreenMedia}
              onClose={() => setFullscreenMedia(null)}
            />
          )}
        </>
      );
    }

    if (isVideoType(f)) {
      return (
        <>
          <div className={cn('mt-2 max-w-md pointer-events-none', className)}>
            <button
              type="button"
              onClick={() => setFullscreenMedia(f)}
              className="block rounded-lg overflow-hidden border border-border-primary hover:opacity-90 transition-all hover:scale-[1.01] cursor-pointer pointer-events-auto"
            >
              <video
                src={url}
                controls
                playsInline
                preload="metadata"
                className="w-full rounded-lg"
                onClick={(e) => e.stopPropagation()}
              />
            </button>
          </div>
          {fullscreenMedia && (
            <MediaFullscreenModal
              media={fullscreenMedia}
              onClose={() => setFullscreenMedia(null)}
            />
          )}
        </>
      );
    }

    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'mt-2 flex items-center gap-2 p-2 bg-bg-quaternary rounded-md hover:bg-bg-hover transition-colors pointer-events-auto',
          className
        )}
      >
        <span className="text-lg">📎</span>
        <span className="text-green-primary hover:underline truncate">{f.mimeType ? `Download (${f.mimeType})` : 'Download'}</span>
      </a>
    );
  }

  // Multiple files - grid layout
  const cols = files.length <= 2 ? 2 : files.length <= 4 ? 2 : 3;
  return (
    <>
      <div
        className={cn(
          'mt-2 grid gap-1 max-w-md pointer-events-none',
          cols === 2 && 'grid-cols-2',
          cols === 3 && 'grid-cols-3',
          className
        )}
      >
        {files.map((f) => {
          const url = f.url;
          if (!url) return null;

          if (isImageType(f) && !imageErrors.has(f.id)) {
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFullscreenMedia(f)}
                className="relative block rounded-lg overflow-hidden border border-border-primary hover:opacity-90 transition-all hover:scale-[1.02] cursor-pointer aspect-square pointer-events-auto"
              >
                <Image
                  src={url}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="(max-width: 28rem) 50vw, 200px"
                  unoptimized
                  onError={() => onImageError(f.id)}
                />
              </button>
            );
          }

          if (isVideoType(f)) {
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFullscreenMedia(f)}
                className="rounded-lg overflow-hidden border border-border-primary aspect-square bg-bg-quaternary hover:opacity-90 transition-all hover:scale-[1.02] cursor-pointer pointer-events-auto"
              >
                <video
                  src={url}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-contain"
                  onClick={(e) => e.stopPropagation()}
                />
              </button>
            );
          }

          return (
            <a
              key={f.id}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-2 bg-bg-quaternary rounded-md hover:bg-bg-hover transition-colors pointer-events-auto"
            >
              <span className="text-lg">📎</span>
              <span className="text-green-primary hover:underline truncate text-sm">{f.mimeType ? `Download (${f.mimeType})` : 'Download'}</span>
            </a>
          );
        })}
      </div>
      {fullscreenMedia && (
        <MediaFullscreenModal
          media={fullscreenMedia}
          onClose={() => setFullscreenMedia(null)}
        />
      )}
    </>
  );
}
