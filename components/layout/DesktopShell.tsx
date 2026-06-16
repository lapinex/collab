'use client';

import { AppShell, type AppShellSlots } from './AppShell';
import type { AppShellSlotState } from './slots/types';
import { DEFAULT_SHELL_STATE } from './slots/types';

type DesktopShellProps = {
  slots: AppShellSlots;
  /** Override slot state if needed */
  slotState?: Partial<AppShellSlotState>;
  className?: string;
};

/**
 * Desktop: side navigation, all panels visible.
 */
export function DesktopShell({ slots, slotState, className }: DesktopShellProps) {
  const state: AppShellSlotState = {
    ...DEFAULT_SHELL_STATE,
    ...slotState,
  };
  return <AppShell slotState={state} slots={slots} className={className} />;
}
