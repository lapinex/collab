import { useAppStore } from '@/stores/app-store';

export type AppStoreState = ReturnType<typeof useAppStore.getState>;

export const selectSelectedServerId = (state: AppStoreState) => state.selectedServerId;
export const selectSelectedChannelId = (state: AppStoreState) => state.selectedChannelId;
export const selectActiveTab = (state: AppStoreState) => state.activeTab;
export const selectSelectedDMChannelId = (state: AppStoreState) => state.selectedDMChannelId;

export const selectSetSelectedServer = (state: AppStoreState) => state.setSelectedServer;
export const selectSetSelectedChannel = (state: AppStoreState) => state.setSelectedChannel;
export const selectSetActiveTab = (state: AppStoreState) => state.setActiveTab;
export const selectSetSelectedDMChannelId = (state: AppStoreState) => state.setSelectedDMChannelId;
