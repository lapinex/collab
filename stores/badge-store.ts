'use client';

import { create } from 'zustand';
import type { BadgeCounts, DMBadgeCounts } from '@/hooks/useBadges';

interface BadgeState {
  serverBadges: Record<string, BadgeCounts>;
  channelBadges: Record<string, BadgeCounts>;
  dmBadges: Record<string, DMBadgeCounts>;
  setBadges: (data: {
    servers: Record<string, BadgeCounts>;
    channels: Record<string, BadgeCounts>;
    dms: Record<string, DMBadgeCounts>;
  }) => void;
}

export const useBadgeStore = create<BadgeState>((set) => ({
  serverBadges: {},
  channelBadges: {},
  dmBadges: {},
  setBadges: (data) =>
    set({
      serverBadges: data.servers ?? {},
      channelBadges: data.channels ?? {},
      dmBadges: data.dms ?? {},
    }),
}));
