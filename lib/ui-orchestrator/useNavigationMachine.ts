'use client';

import { useCallback, useMemo } from 'react';
import { useAppStore } from '@/stores/app-store';
import {
  selectActiveTab,
  selectSelectedChannelId,
  selectSelectedDMChannelId,
  selectSelectedServerId,
  selectSetActiveTab,
  selectSetSelectedChannel,
  selectSetSelectedDMChannelId,
  selectSetSelectedServer,
} from '@/stores/app.selectors';
import {
  type NavigationContext,
  type VoiceConnectionState,
  type NavigationUpdate,
} from './state-machine';
import { createOrchestratorSend } from './Orchestrator';

type UseNavigationMachineOptions = {
  voiceConnectionState: VoiceConnectionState;
  channels: Array<{ id: string; type: string }>;
};

/**
 * Hook that provides send(event) for navigation.
 * All navigation goes through the Orchestrator (state machine + rules + observability).
 */
export function useNavigationMachine({
  voiceConnectionState,
  channels,
}: UseNavigationMachineOptions) {
  const activeTab = useAppStore(selectActiveTab);
  const selectedServerId = useAppStore(selectSelectedServerId);
  const selectedChannelId = useAppStore(selectSelectedChannelId);
  const selectedDMChannelId = useAppStore(selectSelectedDMChannelId);
  const setActiveTab = useAppStore(selectSetActiveTab);
  const setSelectedServer = useAppStore(selectSetSelectedServer);
  const setSelectedChannel = useAppStore(selectSetSelectedChannel);
  const setSelectedDMChannelId = useAppStore(selectSetSelectedDMChannelId);

  const applyUpdates = useCallback(
    (update: NavigationUpdate) => {
      if (update.activeTab !== undefined) setActiveTab(update.activeTab);
      if (update.selectedServerId !== undefined) setSelectedServer(update.selectedServerId);
      if (update.selectedChannelId !== undefined) setSelectedChannel(update.selectedChannelId);
      if (update.selectedDMChannelId !== undefined)
        setSelectedDMChannelId(update.selectedDMChannelId);
    },
    [setActiveTab, setSelectedServer, setSelectedChannel, setSelectedDMChannelId]
  );

  const getContext = useCallback((): NavigationContext => {
    const state = useAppStore.getState();
    return {
      activeTab: state.activeTab,
      selectedServerId: state.selectedServerId,
      selectedChannelId: state.selectedChannelId,
      selectedDMChannelId: state.selectedDMChannelId,
      voiceConnectionState,
      isViewingVoiceChannel:
        !!state.selectedChannelId &&
        !!channels.find((c) => c.id === state.selectedChannelId && c.type === 'voice'),
    };
  }, [voiceConnectionState, channels]);

  const send = useMemo(
    () => createOrchestratorSend(getContext, applyUpdates),
    [getContext, applyUpdates]
  );

  const context: NavigationContext = {
    activeTab,
    selectedServerId,
    selectedChannelId,
    selectedDMChannelId,
    voiceConnectionState,
    isViewingVoiceChannel:
      !!selectedChannelId &&
      !!channels.find((c) => c.id === selectedChannelId && c.type === 'voice'),
  };
  return { send, context };
}
