'use client';

import { useRef } from 'react';
import { cn } from '@/lib/utils';

export type MediaType = 'image' | 'video' | 'gif';

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
const VIDEO_ACCEPT = 'video/mp4,video/webm,video/quicktime';
const GIF_ACCEPT = 'image/gif';

interface UploadButtonProps {
  onFiles: (files: File[]) => void;
  accept?: MediaType | 'all';
  className?: string;
  title?: string;
  children?: React.ReactNode;
}

export function UploadButton({
  onFiles,
  accept = 'all',
  className,
  title = 'Attach',
  children,
}: UploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const acceptStr =
    accept === 'image'
      ? IMAGE_ACCEPT
      : accept === 'video'
        ? VIDEO_ACCEPT
        : accept === 'gif'
          ? GIF_ACCEPT
          : `${IMAGE_ACCEPT},${VIDEO_ACCEPT}`;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list?.length) return;
    const files = Array.from(list);
    onFiles(files);
    e.target.value = '';
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={acceptStr}
        multiple
        className="hidden"
        onChange={handleChange}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        title={title}
        className={cn(
          'flex-shrink-0 p-2 rounded-md',
          'text-text-secondary hover:text-green-primary hover:bg-bg-hover',
          'transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-primary',
          className
        )}
      >
        {children ?? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        )}
      </button>
    </>
  );
}
