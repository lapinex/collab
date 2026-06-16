'use client';

import { useState, useEffect } from 'react';

export type BreakpointShell = 'desktop' | 'tablet' | 'mobile';

/** Breakpoints (px): < tablet = mobile, tablet..desktop = tablet, >= desktop = desktop */
const TABLET_MIN = 768;
const DESKTOP_MIN = 1024;

function getShell(width: number): BreakpointShell {
  if (width >= DESKTOP_MIN) return 'desktop';
  if (width >= TABLET_MIN) return 'tablet';
  return 'mobile';
}

/**
 * Returns current breakpoint shell based on viewport width.
 * Desktop: side nav + all panels. Tablet: drawer for channels. Mobile: bottom nav, full-screen.
 */
export function useBreakpointShell(): BreakpointShell {
  const [shell, setShell] = useState<BreakpointShell>(() => {
    if (typeof window === 'undefined') return 'desktop';
    return getShell(window.innerWidth);
  });

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${DESKTOP_MIN}px)`);
    const mqlTablet = window.matchMedia(`(min-width: ${TABLET_MIN}px)`);

    const update = () => setShell(getShell(window.innerWidth));

    mql.addEventListener('change', update);
    mqlTablet.addEventListener('change', update);
    update();

    return () => {
      mql.removeEventListener('change', update);
      mqlTablet.removeEventListener('change', update);
    };
  }, []);

  return shell;
}
