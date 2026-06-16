'use client';

import { create } from 'zustand';

export type NavigationActiveTab = 'servers' | 'dms';

export type ActivePane = 'main' | 'settings' | null;

interface NavigationState {
  selectedServerId: string | null;
  selectedChannelId: string | null;
  activeTab: NavigationActiveTab;
  selectedDMChannelId: string | null;
  activePane: ActivePane;

  setSelectedServer: (serverId: string | null) => void;
  setSelectedChannel: (channelId: string | null) => void;
  setActiveTab: (tab: NavigationActiveTab) => void;
  setSelectedDMChannelId: (channelId: string | null) => void;
  setActivePane: (pane: ActivePane) => void;

  reset: () => void;
}

const initialState = {
  selectedServerId: null,
  selectedChannelId: null,
  activeTab: 'servers' as NavigationActiveTab,
  selectedDMChannelId: null,
  activePane: null as ActivePane,
};

/** Current open channel id (server channel or DM) for toast "don't show if already here". */
export function getCurrentOpenChannelId(state: {
  activeTab: NavigationActiveTab;
  selectedChannelId: string | null;
  selectedDMChannelId: string | null;
}): string | null {
  return state.activeTab === 'dms' ? state.selectedDMChannelId : state.selectedChannelId;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  ...initialState,

  setSelectedServer: (serverId) =>
    set({
      selectedServerId: serverId,
      selectedChannelId: null,
    }),

  setSelectedChannel: (channelId) => set({ selectedChannelId: channelId }),

  setActiveTab: (tab) => set({ activeTab: tab }),

  setSelectedDMChannelId: (channelId) => set({ selectedDMChannelId: channelId }),

  setActivePane: (pane) => set({ activePane: pane }),

  reset: () => set(initialState),
}));
