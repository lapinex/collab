'use client';

import Image from 'next/image';

import { cn } from '@/lib/utils';

export interface MediaPreviewItem {
  id: string;
  file?: File; // optional for sticker (url-only, no re-upload)
  url: string;
  type: 'image' | 'video' | 'gif' | 'sticker';
  width?: number;
  height?: number;
}

interface MediaPreviewProps {
  items: MediaPreviewItem[];
  onRemove: (id: string) => void;
  className?: string;
}

export function MediaPreview({ items, onRemove, className }: MediaPreviewProps) {
  if (items.length === 0) return null;

  return (
    <div
      className={cn(
        'px-4 pt-3 pb-2 border-b border-border-primary bg-bg-tertiary',
        'animate-slide-in-top',
        className
      )}
    >
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <MediaPreviewThumb
            key={item.id}
            item={item}
            onRemove={() => onRemove(item.id)}
          />
        ))}
      </div>
    </div>
  );
}

function MediaPreviewThumb({
  item,
  onRemove,
}: {
  item: MediaPreviewItem;
  onRemove: () => void;
}) {
  return (
    <div className="relative group rounded-lg overflow-hidden bg-bg-quaternary border border-border-primary animate-zoom-in">
      <div className="w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center">
        {item.type === 'sticker' || item.type === 'image' || item.type === 'gif' ? (
          <Image
            src={item.url}
            alt={item.file?.name ?? 'sticker'}
            width={112}
            height={112}
            sizes="(max-width: 640px) 96px, 112px"
            className="w-full h-full object-contain"
            unoptimized={item.type === 'gif' || item.url.startsWith('data:') || item.url.startsWith('blob:') || item.url.startsWith('/media/')}
          />
        ) : (
          <video
            src={item.url}
            muted
            playsInline
            className="w-full h-full object-cover"
          />
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className={cn(
          'absolute top-1 right-1 w-6 h-6 rounded-full',
          'bg-danger/90 text-white flex items-center justify-center',
          'opacity-0 group-hover:opacity-100 transition-opacity',
          'hover:bg-danger focus:outline-none focus:ring-2 focus:ring-green-primary',
          'shadow-lg'
        )}
        title="Remove"
        aria-label="Remove"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
