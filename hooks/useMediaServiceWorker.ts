'use client';

import { useEffect } from 'react';

export function useMediaServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw-media-cache.js', { scope: '/' })
      .then(async (reg) => {
        const { clientEnv } = await import('@/lib/env/clientEnv');
        if (clientEnv.nodeEnv === 'development') {
          console.log('[SW] Media cache registered', reg.scope);
        }
      })
      .catch((err) => {
        console.warn('[SW] Media cache registration failed', err);
      });
  }, []);
}
