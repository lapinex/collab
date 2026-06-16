'use client';

import { create } from 'zustand';
import type { ActivityType } from '@/types/activity';

export interface UserActivityState {
  userId: string;
  userName: string;
  activityType: ActivityType;
  startedAt: number;
}

type ChannelActivities = Record<string, Map<string, UserActivityState>>;

interface ActivityStoreState {
  activities: ChannelActivities;

  startActivity: (channelId: string, userId: string, userName: string, activityType: ActivityType) => void;
  stopActivity: (channelId: string, userId: string) => void;
  getActivitiesForChannel: (channelId: string) => UserActivityState[];
  clearChannel: (channelId: string) => void;
}

export const useActivityStore = create<ActivityStoreState>()((set, get) => ({
  activities: {},

  startActivity: (channelId, userId, userName, activityType) => {
    set((state) => {
      const channelMap = new Map(state.activities[channelId]);
      channelMap.set(userId, {
        userId,
        userName,
        activityType,
        startedAt: Date.now(),
      });
      return {
        activities: {
          ...state.activities,
          [channelId]: channelMap,
        },
      };
    });
  },

  stopActivity: (channelId, userId) => {
    set((state) => {
      const channelMap = state.activities[channelId];
      if (!channelMap) return state;
      const next = new Map(channelMap);
      next.delete(userId);
      if (next.size === 0) {
        const { [channelId]: _, ...rest } = state.activities;
        return { activities: rest };
      }
      return {
        activities: {
          ...state.activities,
          [channelId]: next,
        },
      };
    });
  },

  getActivitiesForChannel: (channelId) => {
    const channelMap = get().activities[channelId];
    if (!channelMap) return [];
    return Array.from(channelMap.values());
  },

  clearChannel: (channelId) => {
    set((state) => {
      const { [channelId]: _, ...rest } = state.activities;
      return { activities: rest };
    });
  },
}));
