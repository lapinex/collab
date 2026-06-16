'use client';

import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type WindowAction = 'close' | 'minimize' | 'maximize' | 'refresh';

interface CollabDesktopWindow extends Window {
  __COLLAB_DESKTOP__?: boolean;
  collabDesktop?: { minimize: () => void; maximize: () => void; close: () => void };
}

export function DesktopWindowControls() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const globalFlag = (window as CollabDesktopWindow).__COLLAB_DESKTOP__ === true;
    const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false;

    setIsDesktop(globalFlag || isStandalone);
  }, []);

  const emit = useCallback((action: WindowAction) => {
    if (typeof window === 'undefined') return;

    if (action === 'refresh') {
      window.location.reload();
      return;
    }

    const api = (window as CollabDesktopWindow).collabDesktop;
    if (api) {
      if (action === 'minimize') api.minimize();
      else if (action === 'maximize') api.maximize();
      else if (action === 'close') api.close();
      return;
    }

    const event = new CustomEvent<WindowAction>('collab-desktop-window-control', { detail: action });
    window.dispatchEvent(event);
    if (action === 'close') window.close();
  }, []);

  if (!isDesktop) {
    return null;
  }

  const btn =
    'w-8 h-8 flex items-center justify-center rounded-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors';
  const icon = 'stroke-current stroke-[1.5]';

  return (
    <div
      className={cn(
        'fixed top-0 right-0 z-50 flex items-center gap-0.5 px-1 py-1',
        'bg-bg-primary/95 backdrop-blur border-b border-l border-border-primary rounded-bl-lg'
      )}
    >
      <button
        type="button"
        onClick={() => emit('minimize')}
        className={btn}
        title="Minimize"
        aria-label="Minimize window"
      >
        <svg width={12} height={12} viewBox="0 0 12 12" fill="none" className={icon}>
          <path d="M2 6h8" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => emit('maximize')}
        className={btn}
        title="Maximize"
        aria-label="Maximize window"
      >
        <svg width={12} height={12} viewBox="0 0 12 12" fill="none" className={icon}>
          <rect x="1" y="1" width="10" height="10" rx="0.5" strokeWidth="1.5" />
          <rect x="3" y="3" width="8" height="8" rx="0.5" strokeWidth="1.5" />
        </svg>
      </button>
      <button type="button" onClick={() => emit('refresh')} className={btn} title="Refresh">
        <svg width={12} height={12} viewBox="0 0 12 12" fill="none" className={icon}>
          <path d="M10 3V1H8M2 9v2h2M10 6a4 4 0 1 1-4-4h2M2 6a4 4 0 1 0 4 4H4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => emit('close')}
        className={cn(btn, 'hover:text-danger hover:bg-danger/10')}
        title="Close"
        aria-label="Close window"
      >
        <svg width={12} height={12} viewBox="0 0 12 12" fill="none" className={icon}>
          <path d="M2 2l8 8M10 2L2 10" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

