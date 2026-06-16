'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface MediaViewerModalProps {
  url: string;
  type: 'image' | 'gif' | 'video';
  fileName?: string;
  onClose: () => void;
}

export function MediaViewerModal({ url, type, fileName, onClose }: MediaViewerModalProps) {
  const [mounted, setMounted] = useState(false);
  const [imageError, setImageError] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    // Prevent body scroll when modal is open
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = originalOverflow;
    };
  }, [onClose, mounted]);

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
        aria-label="Close"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Media content: explicit min size so fill image has a non-zero box; fallback on error */}
      <div
        className="flex items-center justify-center w-full h-full min-w-[280px] min-h-[200px] max-w-[95vw] max-h-[95vh] p-4"
        style={{ width: 'min(95vw, 1200px)', height: 'min(95vh, 85vh)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {type === 'video' ? (
          <video
            src={url}
            controls
            autoPlay
            className="max-w-full max-h-[85vh] w-auto h-auto object-contain rounded-lg min-h-[200px]"
            onClick={(e) => e.stopPropagation()}
          />
        ) : imageError ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center justify-center gap-3 p-6 rounded-lg bg-bg-tertiary border border-border-primary text-text-secondary hover:bg-bg-quaternary"
          >
            <span className="text-2xl opacity-70">🖼️</span>
            <span className="text-sm">Image failed to load — open link</span>
          </a>
        ) : (
          <div
            className="relative w-full h-full min-w-[280px] min-h-[200px] max-w-[95vw] max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={url}
              alt={fileName || 'Media'}
              fill
              className="object-contain rounded-lg"
              sizes="95vw"
              unoptimized
              onError={() => setImageError(true)}
            />
          </div>
        )}
      </div>
    </div>
  );

  // Render modal in portal to document.body to ensure it's above everything
  if (!mounted) return null;
  return typeof window !== 'undefined' ? createPortal(modalContent, document.body) : null;
}
