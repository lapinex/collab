'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { overlayBackdropClass, modalPanelClass, iconButtonClass, focusClass } from '@/lib/ui/classes';

const EXIT_DURATION_MS = 200;

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after exit animation finishes; use to unmount modal (e.g. clear "closing" state). */
  onClosed?: () => void;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}

function getFocusable(container: HTMLElement): HTMLElement[] {
  const selectors = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ];
  return Array.from(container.querySelectorAll<HTMLElement>(selectors.join(','))).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true'
  );
}

export function Modal({ isOpen, onClose, onClosed, children, className, ariaLabel = 'Dialog' }: ModalProps) {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const lastActiveRef = React.useRef<HTMLElement | null>(null);
  const [isExiting, setIsExiting] = React.useState(false);
  const wasOpenRef = React.useRef(isOpen);

  // Start exit when isOpen goes false; after animation call onClosed
  React.useEffect(() => {
    if (wasOpenRef.current && !isOpen) {
      setIsExiting(true);
      const t = setTimeout(() => {
        setIsExiting(false);
        onClosed?.();
      }, EXIT_DURATION_MS);
      return () => clearTimeout(t);
    }
    wasOpenRef.current = isOpen;
    return undefined;
  }, [isOpen, onClosed]);

  // Close on escape key; body scroll lock
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      wasOpenRef.current = true;
      lastActiveRef.current = document.activeElement as HTMLElement | null;
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';

      setTimeout(() => {
        const el = dialogRef.current;
        if (!el) return;
        const focusables = getFocusable(el);
        (focusables[0] ?? el).focus();
      }, 0);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
      lastActiveRef.current?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen && !isExiting) return null;

  const isExit = !isOpen && isExiting;

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center">
      {/* Backdrop */}
      <div
        className={cn(overlayBackdropClass, isExit && 'animate-out fade-out-0 duration-200')}
        onClick={onClose}
        aria-hidden
      />

      {/* Modal content */}
      <div
        ref={dialogRef}
        className={cn(
          modalPanelClass,
          isExit ? 'animate-out fade-out-0 zoom-out-95 duration-200' : 'animate-in fade-in-0 zoom-in-95 duration-200',
          className
        )}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key !== 'Tab') return;
          const el = dialogRef.current;
          if (!el) return;
          const focusables = getFocusable(el);
          if (focusables.length === 0) {
            e.preventDefault();
            return;
          }
          const first = focusables[0]!;
          const last = focusables[focusables.length - 1]!;
          const active = document.activeElement as HTMLElement | null;
          if (e.shiftKey) {
            if (!active || active === first) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (active === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

interface ModalHeaderProps {
  children: React.ReactNode;
  onClose?: () => void;
  className?: string;
}

export function ModalHeader({ children, onClose, className }: ModalHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between',
        'px-6 py-4 border-b border-border-primary',
        className
      )}
    >
      <h2 className="text-lg font-semibold text-text-primary">{children}</h2>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className={cn(iconButtonClass, focusClass)}
          aria-label="Close dialog"
        >
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
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}

interface ModalBodyProps {
  children: React.ReactNode;
  className?: string;
}

export function ModalBody({ children, className }: ModalBodyProps) {
  return (
    <div className={cn('px-6 py-4', className)}>
      {children}
    </div>
  );
}

interface ModalFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function ModalFooter({ children, className }: ModalFooterProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-3',
        'px-6 py-4 border-t border-border-primary',
        className
      )}
    >
      {children}
    </div>
  );
}
