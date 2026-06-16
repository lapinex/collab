import { usePresenceStore } from '@/stores/presence-store';

export type PresenceStoreState = ReturnType<typeof usePresenceStore.getState>;

export const selectPresence = (state: PresenceStoreState) => state.presence;
export const selectPresenceById = (state: PresenceStoreState) => state.presence.byId;
export const selectOnlineUserIds = (state: PresenceStoreState) => state.presence.onlineIds;
export const selectPresenceLastUpdated = (state: PresenceStoreState) => state.presence.lastUpdated;
export const selectCurrentUserId = (state: PresenceStoreState) => state.currentUserId;

export const selectMergePresence = (state: PresenceStoreState) => state.mergePresence;
export const selectSetCurrentUserId = (state: PresenceStoreState) => state.setCurrentUserId;
export const selectSetOnline = (state: PresenceStoreState) => state.setOnline;
export const selectSetOffline = (state: PresenceStoreState) => state.setOffline;
export const selectSetOnlineUserIds = (state: PresenceStoreState) => state.setOnlineUserIds;
export const selectReconcileOnlineUserIds = (state: PresenceStoreState) => state.reconcileOnlineUserIds;
export const selectGetStatus = (state: PresenceStoreState) => state.getStatus;
export const selectGetPresence = (state: PresenceStoreState) => state.getPresence;

export const selectOnlineUsersCount = (state: PresenceStoreState) => state.presence.onlineIds.length;

export const selectPresenceByUserId =
  (userId: string) =>
  (state: PresenceStoreState) =>
    state.presence.byId[userId] ?? null;

export const selectPresenceStatusByUserId =
  (userId: string) =>
  (state: PresenceStoreState) =>
    state.presence.byId[userId]?.status ?? 'offline';

export const selectIsUserOnline =
  (userId: string) =>
  (state: PresenceStoreState) =>
    state.presence.onlineIds.includes(userId);
