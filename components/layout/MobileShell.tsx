'use client';

import { AppShell, type AppShellSlots } from './AppShell';
import type { AppShellSlotState } from './slots/types';

type MobileShellProps = {
  slots: AppShellSlots;
  /** Mobile: full-screen main; sidebars hidden (drawer/overlay when opened) */
  slotState?: Partial<AppShellSlotState>;
  className?: string;
};

/**
 * Mobile: bottom nav, full-screen transitions.
 * Default: left nav visible (icons), channel sidebar hidden, main full, right panel hidden.
 */
export function MobileShell({ slots, slotState, className }: MobileShellProps) {
  const state: AppShellSlotState = {
    leftNav: 'visible',
    channelSidebar: 'visible',
    main: 'visible',
    rightPanel: 'hidden',
    voiceFooter: 'visible',
    ...slotState,
  };
  return <AppShell slotState={state} slots={slots} className={className} />;
}
