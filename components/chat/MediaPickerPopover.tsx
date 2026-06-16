'use client';

import { useRef, useState, useCallback, DragEvent, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useClickOutside } from '@/hooks/useClickOutside';

interface MediaPickerPopoverProps {
  onFiles: (files: File[]) => void;
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
  className?: string;
}

export function MediaPickerPopover({
  onFiles,
  onClose,
  anchorRef,
  className,
}: MediaPickerPopoverProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [hasCamera, setHasCamera] = useState(false);

  // Check camera availability
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          setHasCamera(devices.some((d) => d.kind === 'videoinput'));
        })
        .catch(() => {});
    }
  }, []);

  // Mount check for portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Calculate position
  useEffect(() => {
    if (!anchorRef?.current || !mounted) return;

    const anchorRect = anchorRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const spacing = 8;
    const popoverWidth = 256;
    const popoverHeight = 200;

    let top: number;
    let left: number;

    const spaceAbove = anchorRect.top;
    const spaceBelow = viewportHeight - anchorRect.bottom;

    if (spaceAbove >= popoverHeight + spacing) {
      top = anchorRect.top - popoverHeight - spacing;
    } else if (spaceBelow >= popoverHeight + spacing) {
      top = anchorRect.bottom + spacing;
    } else {
      top = Math.max(spacing, Math.min(viewportHeight - popoverHeight - spacing, (viewportHeight - popoverHeight) / 2));
    }

    left = anchorRect.left;
    if (left + popoverWidth > viewportWidth) {
      left = viewportWidth - popoverWidth - spacing;
    }
    if (left < spacing) {
      left = spacing;
    }

    setPosition({ top, left });
  }, [anchorRef, mounted]);

  // Click outside handler
  useClickOutside(popoverRef, () => onClose(), mounted && !!position);

  // Escape key handler
  useEffect(() => {
    if (!mounted) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose, mounted]);

  const handleFileSelect = useCallback(
    (files: FileList | null) => {
      if (!files?.length) return;
      onFiles(Array.from(files));
      onClose();
    },
    [onFiles, onClose]
  );

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files);
    e.target.value = '';
  };

  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((track) => track.stop());
      fileInputRef.current?.click();
    } catch (err) {
      console.error('Camera access denied:', err);
      fileInputRef.current?.click();
    }
    onClose();
  };

  if (!mounted || !position) return null;

  const content = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,image/gif"
        multiple
        className="hidden"
        onChange={handleFileInput}
      />
      <div
        ref={popoverRef}
        role="dialog"
        aria-label="Media picker"
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'fixed z-50 w-64',
          'bg-bg-tertiary border border-border-primary rounded-lg shadow-xl',
          'p-2 animate-slide-in-bottom',
          className
        )}
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
        }}
      >
        <div
          className={cn(
            'border-2 border-dashed rounded-lg p-6 text-center transition-colors',
            isDragging
              ? 'border-green-primary bg-green-primary/10'
              : 'border-border-primary hover:border-border-secondary'
          )}
        >
          {isDragging ? (
            <div className="text-green-primary font-medium">Drop files here</div>
          ) : (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mx-auto mb-2 text-text-secondary"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <p className="text-sm text-text-muted mb-3">Drag & drop files here</p>
            </>
          )}
        </div>

        <div className="mt-2 space-y-1">
          <button
            type="button"
            onClick={() => {
              fileInputRef.current?.click();
            }}
            className="w-full px-3 py-2 text-left text-sm rounded-md hover:bg-bg-hover transition-colors flex items-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            Photo / Video
          </button>
          {hasCamera && (
            <button
              type="button"
              onClick={openCamera}
              className="w-full px-3 py-2 text-left text-sm rounded-md hover:bg-bg-hover transition-colors flex items-center gap-2"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              Camera
            </button>
          )}
        </div>
      </div>
    </>
  );

  return typeof window !== 'undefined' ? createPortal(content, document.body) : null;
}
