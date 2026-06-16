'use client';

import type { ReactNode } from 'react';
import { Slot } from './slots/Slot';
import type { AppShellSlotState } from './slots/types';

export type AppShellSlots = {
  leftNav: ReactNode;
  channelSidebar: ReactNode;
  main: ReactNode;
  rightPanel: ReactNode;
  voiceFooter: ReactNode;
};

type AppShellProps = {
  slotState: AppShellSlotState;
  slots: AppShellSlots;
  /** Optional class on the root container */
  className?: string;
};

/**
 * Layout shell with stable slots. All slots are always mounted;
 * visibility is controlled via slotState (CSS only, no conditional render).
 */
export function AppShell({ slotState, slots, className }: AppShellProps) {
  return (
    <div className={className ?? 'flex h-screen bg-bg-primary'} data-shell="app">
      <Slot name="left-nav" state={slotState.leftNav} className="flex-shrink-0 w-[72px] bg-bg-primary border-r border-border-primary">
        {slots.leftNav}
      </Slot>
      <Slot
        name="channel-sidebar"
        state={slotState.channelSidebar}
        className="flex-shrink-0 w-60 flex flex-col bg-bg-tertiary border-l-2 border-border-primary border-r border-border-primary"
        collapsedClass="w-0 min-w-0 overflow-hidden"
      >
        {slots.channelSidebar}
      </Slot>
      <Slot name="main" state={slotState.main} className="flex-1 flex flex-col min-w-0 min-h-0">
        {slots.main}
      </Slot>
      <Slot
        name="right-panel"
        state={slotState.rightPanel}
        className="flex-shrink-0 flex flex-col"
        collapsedClass="w-0 min-w-0 overflow-hidden"
      >
        {slots.rightPanel}
      </Slot>
      <Slot name="voice-footer" state={slotState.voiceFooter} className="flex-shrink-0">
        {slots.voiceFooter}
      </Slot>
    </div>
  );
}
