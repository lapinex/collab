'use client';

import { createContext, useContext, type ReactNode } from 'react';

export interface SelectedVoiceChannelValue {
  channelId: string;
  channelName: string;
}

const SelectedVoiceChannelContext = createContext<SelectedVoiceChannelValue | null>(null);

export function SelectedVoiceChannelProvider({
  value,
  children,
}: {
  value: SelectedVoiceChannelValue | null;
  children: ReactNode;
}) {
  return (
    <SelectedVoiceChannelContext.Provider value={value}>
      {children}
    </SelectedVoiceChannelContext.Provider>
  );
}

export function useSelectedVoiceChannel(): SelectedVoiceChannelValue | null {
  return useContext(SelectedVoiceChannelContext);
}
