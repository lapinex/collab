'use client';

import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMediaServiceWorker } from '@/hooks/useMediaServiceWorker';
import { getRealtimeManager } from '@/lib/realtime/RealtimeManager';
import { UserProfileProvider } from '@/contexts/UserProfileContext';
import { UserProfilePopover } from '@/components/user/UserProfilePopover';
import { ToastOverlay } from '@/components/notifications/ToastOverlay';
import { AppNavigationProvider } from '@/lib/ui-orchestrator/AppNavigationProvider';
import { preloadNotifyAudio } from '@/lib/notifications/notifyAudio';

export function Providers({ children }: { children: React.ReactNode }) {
  useMediaServiceWorker();

  useEffect(() => {
    try {
      getRealtimeManager();
      console.info('[Providers] Realtime manager initialized');
    } catch (error) {
      console.error('[Providers] Realtime manager init failed', error);
    }

    try {
      preloadNotifyAudio();
    } catch (error) {
      console.error('[Providers] Notification audio preload failed', error);
    }

    const root = document.documentElement;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const stored = localStorage.getItem('motionPreference') || 'auto';
    const applyMotion = () => {
      const reduce = stored === 'reduce' || (stored === 'auto' && media.matches);
      root.classList.toggle('reduced-motion', reduce);
      root.classList.toggle('motion-ok', !reduce);
    };
    applyMotion();
    const onChange = () => {
      if (stored === 'auto') applyMotion();
    };
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);
  // Создаем QueryClient один раз при монтировании компонента
  // useState гарантирует, что клиент создается только на клиенте
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Отключаем автоматический refetch при фокусе окна
            refetchOnWindowFocus: false,
            // Повторные попытки при ошибке
            retry: 1,
            // Время жизни кеша - 5 минут
            staleTime: 5 * 60 * 1000,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <UserProfileProvider>
        <AppNavigationProvider>
          {children}
          <ToastOverlay />
        </AppNavigationProvider>
        <UserProfilePopover />
      </UserProfileProvider>
    </QueryClientProvider>
  );
}
