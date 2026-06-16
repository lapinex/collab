'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { MediaViewerModal } from './MediaViewerModal';
import type { MediaFile } from '@/lib/media/types';
import {
  readMediaViewerSession,
  saveMediaViewerSession,
  clearMediaViewerSession,
} from '@/lib/media/viewerSession';

interface MessageMediaProps {
  files: MediaFile[];
  className?: string;
  onReaction?: (emoji: string) => void;
  reactions?: Array<{ emoji: string; userId?: string }>;
  currentUserId?: string;
}

function isImageOrGifOrSticker(f: MediaFile): boolean {
  return f.type === 'image' || f.type === 'gif' || f.type === 'sticker';
}

function isGifType(f: MediaFile): boolean {
  return f.type === 'gif';
}

function isVideoType(f: MediaFile): boolean {
  return f.type === 'video';
}

export function MessageMedia({ files, className, onReaction, reactions: _reactions = [], currentUserId: _currentUserId }: MessageMediaProps) {
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [viewerMedia, setViewerMedia] = useState<{ url: string; type: 'image' | 'gif' | 'video'; fileName?: string } | null>(null);

  useEffect(() => {
    const saved = readMediaViewerSession();
    if (!saved) return;
    const existsInMessage = files.some((file) => file.url === saved.url);
    if (existsInMessage) {
      setViewerMedia({ url: saved.url, type: saved.type, fileName: saved.fileName });
    }
  }, [files]);

  useEffect(() => {
    if (viewerMedia) {
      saveMediaViewerSession(viewerMedia);
    } else {
      clearMediaViewerSession();
    }
  }, [viewerMedia]);

  if (!files?.length) return null;

  const onImageError = (id: string) => {
    setImageErrors((prev) => new Set(prev).add(id));
  };

  const openViewer = (file: MediaFile) => {
    if (!file.url) return;
    const type = file.type === 'gif' ? 'gif' : file.type === 'video' ? 'video' : 'image';
    setViewerMedia({ url: file.url, type, fileName: file.mimeType ? `Download (${file.mimeType})` : '' });
  };

  // Single file
  if (files.length === 1) {
    const f = files[0]!;
    const url = f.url;
    if (!url) return null;

    const fileName = f.mimeType ? `Download (${f.mimeType})` : '';
    const isGifFile = isGifType(f);
    const isImageFile = isImageOrGifOrSticker(f) && !imageErrors.has(f.id);
    const isVideoFile = isVideoType(f);

    if (isImageFile) {
      return (
        <>
          <div className={cn('mt-2 max-w-md relative group', className)}>
            <button
              type="button"
              onClick={() => openViewer(f)}
              className="block rounded-lg overflow-hidden border border-border-primary hover:opacity-90 transition-all hover:scale-[1.01] cursor-pointer pointer-events-auto w-full relative min-h-[200px] aspect-video bg-bg-tertiary"
            >
              <Image
                src={url}
                alt={fileName}
                fill
                className="object-contain"
                sizes="(max-width: 28rem) 100vw, 28rem"
                unoptimized={isGifFile || url.startsWith('data:') || url.startsWith('/media/')}
                onError={() => onImageError(f.id)}
              />
            </button>
            
            {/* Reaction overlay - appears on hover */}
            {onReaction && (
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto z-10">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    // Open reaction picker - parent should handle this
                    // For now, add a quick reaction
                    onReaction('👍');
                  }}
                  className="p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-sm transition-colors"
                  title="Add reaction"
                >
                  <span className="text-sm">😀</span>
                </button>
              </div>
            )}
          </div>
          {viewerMedia && (
            <MediaViewerModal
              url={viewerMedia.url}
              type={viewerMedia.type}
              fileName={viewerMedia.fileName}
              onClose={() => setViewerMedia(null)}
            />
          )}
        </>
      );
    }

    if (isImageOrGifOrSticker(f) && imageErrors.has(f.id)) {
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'mt-2 flex items-center justify-center gap-2 p-4 rounded-lg border border-border-primary bg-bg-tertiary text-text-secondary hover:bg-bg-quaternary transition-colors min-h-[200px] aspect-video',
            className
          )}
        >
          <span className="text-2xl opacity-70">🖼️</span>
          <span className="text-sm">Image failed to load — open link</span>
        </a>
      );
    }

    if (isVideoFile) {
      return (
        <>
          <div className={cn('mt-2 max-w-md relative group', className)}>
            <button
              type="button"
              onClick={() => openViewer(f)}
              className="block rounded-lg overflow-hidden border border-border-primary hover:opacity-90 transition-all hover:scale-[1.01] cursor-pointer pointer-events-auto w-full"
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
            
                {/* Reaction overlay for video */}
            {onReaction && (
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto z-10">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onReaction('👍');
                  }}
                  className="p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-sm transition-colors"
                  title="Add reaction"
                >
                  <span className="text-sm">😀</span>
                </button>
              </div>
            )}
          </div>
          {viewerMedia && (
            <MediaViewerModal
              url={viewerMedia.url}
              type={viewerMedia.type}
              fileName={viewerMedia.fileName}
              onClose={() => setViewerMedia(null)}
            />
          )}
        </>
      );
    }

    // Fallback for other file types
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
              <span className="text-green-primary hover:underline truncate">{fileName}</span>
      </a>
    );
  }

  // Multiple files - grid layout
  const cols = files.length <= 2 ? 2 : files.length <= 4 ? 2 : 3;
  return (
    <>
      <div
        className={cn(
          'mt-2 grid gap-1 max-w-md',
          cols === 2 && 'grid-cols-2',
          cols === 3 && 'grid-cols-3',
          className
        )}
      >
        {files.map((f) => {
          const url = f.url;
          if (!url) return null;

          const fileName = f.mimeType ? `Download (${f.mimeType})` : '';
          const isGifFile = isGifType(f);
          const isImageFile = isImageOrGifOrSticker(f) && !imageErrors.has(f.id);
          const isVideoFile = isVideoType(f);

          if (isImageOrGifOrSticker(f) && imageErrors.has(f.id)) {
            return (
              <a
                key={f.id}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1 p-2 rounded-lg border border-border-primary bg-bg-tertiary text-text-secondary hover:bg-bg-quaternary text-xs aspect-square"
              >
                <span>🖼️</span>
                <span>Open link</span>
              </a>
            );
          }

          if (isImageFile) {
            return (
              <div key={f.id} className="relative group aspect-square">
                <button
                  type="button"
                  onClick={() => openViewer(f)}
                  className="block rounded-lg overflow-hidden border border-border-primary hover:opacity-90 transition-all hover:scale-[1.02] cursor-pointer w-full h-full relative aspect-square"
                >
                  <Image
                    src={url}
                    alt={fileName}
                    fill
                    className="object-cover"
                    sizes="(max-width: 28rem) 50vw, 200px"
                    unoptimized={isGifFile || url.startsWith('data:') || url.startsWith('/media/')}
                    onError={() => onImageError(f.id)}
                  />
                </button>
                
                {/* Reaction overlay */}
                {onReaction && (
                  <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto z-10">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onReaction('👍');
                      }}
                      className="p-1 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-sm transition-colors"
                      title="Add reaction"
                    >
                      <span className="text-xs">😀</span>
                    </button>
                  </div>
                )}
              </div>
            );
          }

          if (isVideoFile) {
            return (
              <div key={f.id} className="relative group aspect-square">
                <button
                  type="button"
                  onClick={() => openViewer(f)}
                  className="rounded-lg overflow-hidden border border-border-primary aspect-square bg-bg-quaternary hover:opacity-90 transition-all hover:scale-[1.02] cursor-pointer w-full h-full"
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
                
                {/* Reaction overlay */}
                {onReaction && (
                  <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto z-10">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onReaction('👍');
                      }}
                      className="p-1 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-sm transition-colors"
                      title="Add reaction"
                    >
                      <span className="text-xs">😀</span>
                    </button>
                  </div>
                )}
              </div>
            );
          }

          return (
            <a
              key={f.id}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-2 bg-bg-quaternary rounded-md hover:bg-bg-hover transition-colors"
            >
              <span className="text-lg">📎</span>
              <span className="text-green-primary hover:underline truncate text-sm">{f.mimeType ? `Download (${f.mimeType})` : 'Download'}</span>
            </a>
          );
        })}
      </div>
      {viewerMedia && (
        <MediaViewerModal
          url={viewerMedia.url}
          type={viewerMedia.type}
          fileName={viewerMedia.fileName}
          onClose={() => setViewerMedia(null)}
        />
      )}
    </>
  );
}
