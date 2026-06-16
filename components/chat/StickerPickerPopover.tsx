'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useClickOutside } from '@/hooks/useClickOutside';
import { useServerMeta } from '@/hooks/serverView';

interface StickerPickerPopoverProps {
  onSelect: (stickerUrl: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  className?: string;
  serverId?: string; // For server stickers
}

const PICKER_WIDTH = 352;
const PICKER_HEIGHT = 400;
const STICKER_GRID_HEIGHT = PICKER_HEIGHT - 48; // Minus search height

export function StickerPickerPopover({
  onSelect,
  onClose,
  anchorRef,
  className,
  serverId,
}: StickerPickerPopoverProps) {
  const [search, setSearch] = useState('');
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { data } = useServerMeta(serverId ?? null);
  const serverStickers = useMemo(
    () => (serverId ? (data?.stickers ?? []) : []),
    [serverId, data?.stickers]
  );

  // Calculate position based on anchor
  useEffect(() => {
    if (!anchorRef.current || !mounted) return;

    const anchorRect = anchorRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const spacing = 8;

    let top: number;
    let left: number;

    // Try to position above (bottom-full)
    const spaceAbove = anchorRect.top;
    const spaceBelow = viewportHeight - anchorRect.bottom;

    if (spaceAbove >= PICKER_HEIGHT + spacing) {
      // Position above
      top = anchorRect.top - PICKER_HEIGHT - spacing;
    } else if (spaceBelow >= PICKER_HEIGHT + spacing) {
      // Position below
      top = anchorRect.bottom + spacing;
    } else {
      // Center vertically if neither fits
      top = Math.max(spacing, Math.min(viewportHeight - PICKER_HEIGHT - spacing, (viewportHeight - PICKER_HEIGHT) / 2));
    }

    // Horizontal alignment
    left = anchorRect.left;
    if (left + PICKER_WIDTH > viewportWidth) {
      left = viewportWidth - PICKER_WIDTH - spacing;
    }
    if (left < spacing) {
      left = spacing;
    }

    setPosition({ top, left });
  }, [anchorRef, mounted]);

  // Mount check for portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Click outside handler
  useClickOutside(pickerRef, () => onClose(), mounted);

  // Escape key handler
  useEffect(() => {
    if (!mounted) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose, mounted]);

  const filteredStickers = useMemo(() => {
    if (!search.trim()) {
      return serverStickers;
    }
    const lower = search.toLowerCase();
    return serverStickers.filter((s) => s.name.toLowerCase().includes(lower));
  }, [search, serverStickers]);

  const handleSelect = useCallback(
    (stickerUrl: string) => {
      onSelect(stickerUrl);
      onClose();
    },
    [onSelect, onClose]
  );

  if (!mounted || !position) return null;

  const content = (
    <div
      ref={pickerRef}
      role="dialog"
      aria-label="Sticker picker"
      aria-modal="false"
      className={cn(
        'fixed z-50',
        'bg-bg-tertiary border border-border-primary rounded-lg shadow-xl',
        'flex flex-col',
        'animate-slide-in-bottom',
        className
      )}
      style={{
        width: PICKER_WIDTH,
        height: PICKER_HEIGHT,
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      {/* Search - Fixed height */}
      <div className="h-[48px] p-2 border-b border-border-primary flex-shrink-0">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search stickers..."
          className="w-full h-full px-3 rounded-md bg-bg-primary border border-border-primary text-text-primary placeholder:text-text-muted text-sm focus:outline-none focus:border-green-primary focus:ring-2 focus:ring-green-primary/40"
          autoFocus
        />
      </div>

      {/* Sticker Grid - Fixed height, scrollable */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-2"
        style={{ height: STICKER_GRID_HEIGHT }}
      >
        {filteredStickers.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            {serverStickers.length === 0
              ? 'No stickers available. Add them in server settings.'
              : 'No stickers found.'}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {filteredStickers.map((sticker) => (
              <button
                key={sticker.id}
                type="button"
                onClick={() => handleSelect(sticker.url)}
                className="relative w-full aspect-square flex items-center justify-center rounded-md hover:bg-bg-hover transition-colors p-2 focus:outline-none focus:ring-2 focus:ring-green-primary/40"
                title={sticker.name}
                aria-label={`Sticker ${sticker.name}`}
              >
                <Image
                  src={sticker.url}
                  alt={sticker.name}
                  fill
                  className="object-contain p-2"
                  sizes="80px"
                  unoptimized={sticker.url.startsWith('data:') || sticker.url.startsWith('/media/')}
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return typeof window !== 'undefined' ? createPortal(content, document.body) : null;
}
