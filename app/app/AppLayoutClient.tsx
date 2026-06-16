'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { HydrationBoundary, type DehydratedState } from '@tanstack/react-query';
import { VoiceProvider } from '@/contexts/VoiceContext';
import { useAuthStore } from '@/stores/auth-store';
import { observeCLS, reportWebVitals } from '@/lib/ux-observability/metrics';
import { useLicenseGuard } from '@/hooks/useLicenseGuard';

type AuthUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  globalRole?: 'user' | 'moderator' | 'admin';
};

type AppLayoutClientProps = {
  initialUser: AuthUser;
  dehydratedState: DehydratedState;
  children: React.ReactNode;
  licenseAccepted: boolean;
};

export function AppLayoutClient({ initialUser, dehydratedState, children, licenseAccepted }: AppLayoutClientProps) {
  const bootstrappedRef = useRef(false);
  useLicenseGuard(licenseAccepted);

  useLayoutEffect(() => {
    if (bootstrappedRef.current) {
      return;
    }

    const current = useAuthStore.getState().user;
    if (!current || current.id !== initialUser.id) {
      useAuthStore.getState().setUser(initialUser);
    }

    bootstrappedRef.current = true;
  }, [initialUser]);

  useEffect(() => {
    observeCLS();
    reportWebVitals(); // FCP, LCP, CLS, INP with route telemetry (Week 4)
  }, []);

  return (
    <HydrationBoundary state={dehydratedState}>
      <VoiceProvider>{children}</VoiceProvider>
    </HydrationBoundary>
  );
}
