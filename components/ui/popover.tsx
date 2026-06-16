'use client';

import * as React from 'react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { surfaceElev2Class } from '@/lib/ui/classes';

interface PopoverProps {
  children: React.ReactNode;
  content: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export function Popover({
  children,
  content,
  open: controlledOpen,
  onOpenChange,
  align = 'start',
  side = 'bottom',
  className,
}: PopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const setOpen = useCallback((newOpen: boolean) => {
    if (!isControlled) {
      setInternalOpen(newOpen);
    }
    onOpenChange?.(newOpen);
  }, [isControlled, onOpenChange]);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        triggerRef.current?.contains(event.target as Node) ||
        contentRef.current?.contains(event.target as Node)
      ) {
        return;
      }
      setOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open, setOpen]);

  useEffect(() => {
    if (!open || !triggerRef.current || !contentRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const contentRect = contentRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = 0;
    let left = 0;

    // Calculate position based on side
    switch (side) {
      case 'bottom':
        top = triggerRect.bottom + 4;
        break;
      case 'top':
        top = triggerRect.top - contentRect.height - 4;
        break;
      case 'right':
        left = triggerRect.right + 4;
        top = triggerRect.top;
        break;
      case 'left':
        left = triggerRect.left - contentRect.width - 4;
        top = triggerRect.top;
        break;
    }

    // Calculate horizontal alignment
    switch (align) {
      case 'start':
        left = triggerRect.left;
        break;
      case 'center':
        left = triggerRect.left + (triggerRect.width - contentRect.width) / 2;
        break;
      case 'end':
        left = triggerRect.right - contentRect.width;
        break;
    }

    // Keep in viewport
    if (left + contentRect.width > viewportWidth) {
      left = viewportWidth - contentRect.width - 10;
    }
    if (left < 0) {
      left = 10;
    }

    if (top + contentRect.height > viewportHeight) {
      top = viewportHeight - contentRect.height - 10;
    }
    if (top < 0) {
      top = 10;
    }

    contentRef.current.style.left = `${left}px`;
    contentRef.current.style.top = `${top}px`;
  }, [open, align, side]);

  return (
    <>
      <div
        ref={triggerRef}
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(!open);
          }
          if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      >
        {children}
      </div>
      {open && (
        <div
          ref={contentRef}
          className={cn('fixed z-popover p-2 min-w-[200px]', surfaceElev2Class, className)}
          role="dialog"
          aria-modal="false"
          tabIndex={-1}
        >
          {content}
        </div>
      )}
    </>
  );
}
