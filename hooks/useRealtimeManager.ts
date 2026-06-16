'use client';

import { useState, useEffect } from 'react';
import { getRealtimeManager } from '@/lib/realtime/RealtimeManager';
import type { RealtimeManagerState } from '@/lib/realtime/RealtimeManager';

/**
 * Subscribe to Realtime Manager state (channel count, status).
 * Manager is a singleton; no direct socket usage in UI.
 */
export function useRealtimeManager(): RealtimeManagerState {
  const [state, setState] = useState<RealtimeManagerState>(() =>
    getRealtimeManager().getState()
  );

  useEffect(() => {
    const manager = getRealtimeManager();
    return manager.subscribe(setState);
  }, []);

  return state;
}
