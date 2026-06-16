'use client';

import { AppShell, type AppShellSlots } from './AppShell';
import type { AppShellSlotState } from './slots/types';

type TabletShellProps = {
  slots: AppShellSlots;
  /** e.g. channel sidebar as drawer: collapsed until opened */
  slotState?: Partial<AppShellSlotState>;
  className?: string;
};

/**
 * Tablet: drawer for channels, overlay for DM.
 * Default: right panel collapsed to give more space to main.
 */
export function TabletShell({ slots, slotState, className }: TabletShellProps) {
  const state: AppShellSlotState = {
    leftNav: 'visible',
    channelSidebar: 'visible',
    main: 'visible',
    rightPanel: 'collapsed',
    voiceFooter: 'visible',
    ...slotState,
  };
  return <AppShell slotState={state} slots={slots} className={className} />;
}
