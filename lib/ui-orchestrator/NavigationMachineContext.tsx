'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { UXNavigationEvent } from './state-machine';

type SendFn = (event: UXNavigationEvent) => void;

const NavigationMachineContext = createContext<SendFn | null>(null);

export function NavigationMachineProvider({
  send,
  children,
}: {
  send: SendFn;
  children: ReactNode;
}) {
  return (
    <NavigationMachineContext.Provider value={send}>
      {children}
    </NavigationMachineContext.Provider>
  );
}

export function useNavigationSend(): SendFn {
  const send = useContext(NavigationMachineContext);
  if (!send) {
    throw new Error('useNavigationSend must be used within NavigationMachineProvider');
  }
  return send;
}

/** Returns send or null if outside provider (for optional usage in ToastOverlay) */
export function useNavigationSendOptional(): SendFn | null {
  return useContext(NavigationMachineContext);
}
