'use client';

import type { ReactNode } from 'react';
import { useAppStore } from '@/stores/app-store';
import { selectSelectedServerId } from '@/stores/app.selectors';
import { useChannels } from '@/hooks/useChannels';
import { useVoiceConnection } from '@/contexts/VoiceConnectionManager';
import { useNavigationMachine } from './useNavigationMachine';
import { NavigationMachineProvider } from './NavigationMachineContext';

/**
 * Provides navigation send via context.
 * Must be used inside QueryClientProvider (for useChannels) and where useVoiceConnection works.
 */
export function AppNavigationProvider({ children }: { children: ReactNode }) {
  const selectedServerId = useAppStore(selectSelectedServerId);
  const { channels } = useChannels(selectedServerId);
  const { connectionState } = useVoiceConnection();
  const { send } = useNavigationMachine({
    voiceConnectionState: connectionState,
    channels,
  });

  return <NavigationMachineProvider send={send}>{children}</NavigationMachineProvider>;
}
