import { useBadgeStore } from '@/stores/badge-store';

export type BadgeStoreState = ReturnType<typeof useBadgeStore.getState>;

export const selectServerBadges = (state: BadgeStoreState) => state.serverBadges;
export const selectChannelBadges = (state: BadgeStoreState) => state.channelBadges;
export const selectDMBadges = (state: BadgeStoreState) => state.dmBadges;
export const selectSetBadges = (state: BadgeStoreState) => state.setBadges;

export const selectServerBadge =
  (serverId: string) =>
  (state: BadgeStoreState) =>
    state.serverBadges[serverId];

export const selectChannelBadge =
  (channelId: string) =>
  (state: BadgeStoreState) =>
    state.channelBadges[channelId];

export const selectDMBadge =
  (dmId: string) =>
  (state: BadgeStoreState) =>
    state.dmBadges[dmId];
