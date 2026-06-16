'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { AppActiveTab } from '@/stores/app-store';
import { buildAppUrl, parseAppUrlState } from '@/lib/navigation/appStateUrl';

type RouterLike = {
  replace: (href: string, options?: { scroll?: boolean }) => void;
};

type UseSyncAppStateWithURLOptions = {
  searchParams: URLSearchParams;
  router: RouterLike;
  activeTab: AppActiveTab;
  selectedServerId: string | null;
  selectedChannelId: string | null;
  selectedDMChannelId: string | null;
  setActiveTab: (tab: AppActiveTab) => void;
  setSelectedServer: (serverId: string | null) => void;
  setSelectedChannel: (channelId: string | null) => void;
  setSelectedDMChannelId: (channelId: string | null) => void;
};

export function useSyncAppStateWithURL({
  searchParams,
  router,
  activeTab,
  selectedServerId,
  selectedChannelId,
  selectedDMChannelId,
  setActiveTab,
  setSelectedServer,
  setSelectedChannel,
  setSelectedDMChannelId,
}: UseSyncAppStateWithURLOptions): boolean {
  const initializedRef = useRef(false);
  const currentQuery = searchParams.toString();

  const parsed = useMemo(() => parseAppUrlState(searchParams), [searchParams]);

  useEffect(() => {
    if (initializedRef.current) return;

    if (parsed.tab === 'dms') {
      setActiveTab('dms');
      if (parsed.dmId) setSelectedDMChannelId(parsed.dmId);
    } else if (parsed.tab === 'servers') {
      setActiveTab('servers');
      if (parsed.serverId) setSelectedServer(parsed.serverId);
      if (parsed.channelId) setSelectedChannel(parsed.channelId);
    }

    initializedRef.current = true;
  }, [
    parsed.tab,
    parsed.dmId,
    parsed.serverId,
    parsed.channelId,
    setActiveTab,
    setSelectedDMChannelId,
    setSelectedServer,
    setSelectedChannel,
  ]);

  useEffect(() => {
    if (!initializedRef.current) return;

    const target = buildAppUrl({
      tab: activeTab,
      serverId: selectedServerId,
      channelId: selectedChannelId,
      dmId: selectedDMChannelId,
    });
    const targetQuery = target.includes('?') ? target.split('?')[1] ?? '' : '';
    if (targetQuery === currentQuery) return;

    router.replace(target, { scroll: false });
  }, [
    activeTab,
    selectedServerId,
    selectedChannelId,
    selectedDMChannelId,
    currentQuery,
    router,
  ]);

  return initializedRef.current;
}
