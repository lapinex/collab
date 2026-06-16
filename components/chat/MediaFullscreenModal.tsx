'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import type { MediaFile } from '@/lib/media/types';

interface MediaFullscreenModalProps {
  media: MediaFile;
  onClose: () => void;
}

export function MediaFullscreenModal({ media, onClose }: MediaFullscreenModalProps) {
  const [imageError, setImageError] = useState(false);
  const isImage = media.type === 'image' || media.type === 'gif' || media.type === 'sticker';
  const isVideo = media.type === 'video';
  const isGif = media.type === 'gif';

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  if (!media.url) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
        aria-label="Close"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div
        className="max-w-[95vw] max-h-[95vh] min-w-[280px] min-h-[200px] flex items-center justify-center p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {isImage && !imageError ? (
          <div className="relative w-full h-full max-w-[95vw] max-h-[85vh] min-w-[280px] min-h-[200px]">
            <Image
              src={media.url}
              alt=""
              fill
              className="object-contain rounded-lg"
              sizes="95vw"
              unoptimized={isGif || media.url.startsWith('data:') || media.url.startsWith('/media/')}
              onError={() => setImageError(true)}
            />
          </div>
        ) : isVideo ? (
          <video
            src={media.url}
            controls
            autoPlay
            className="max-w-full max-h-[95vh] rounded-lg"
          />
        ) : (
          <a
            href={media.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-green-primary hover:underline"
          >
            {media.mimeType ? `Download (${media.mimeType})` : 'Download'}
          </a>
        )}
      </div>
    </div>
  );
}
