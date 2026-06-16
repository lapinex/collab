/**
 * Slot visibility state. All slots are always mounted; visibility is controlled via CSS.
 * Avoids layout jumps from conditional mount/unmount.
 */
export type SlotState = 'visible' | 'collapsed' | 'hidden';

export type AppShellSlotState = {
  leftNav: SlotState;
  channelSidebar: SlotState;
  main: SlotState;
  rightPanel: SlotState;
  voiceFooter: SlotState;
};

export const DEFAULT_SHELL_STATE: AppShellSlotState = {
  leftNav: 'visible',
  channelSidebar: 'visible',
  main: 'visible',
  rightPanel: 'visible',
  voiceFooter: 'visible',
};
