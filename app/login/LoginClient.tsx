'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoginForm } from '@/components/auth/LoginForm';
import Link from 'next/link';
import { apiGet } from '@/lib/api-client';
import { clientEnv } from '@/lib/env/clientEnv';

async function hasActiveSession(): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort('auth-me-timeout'), 5000);
  const startedAt = Date.now();
  try {
    await apiGet('/api/auth/me', { skipAuth: true, signal: controller.signal });
    const elapsed = Date.now() - startedAt;
    console.info(`[Auth Bootstrap] /api/auth/me success in ${elapsed}ms`);
    return true;
  } catch (error) {
    const elapsed = Date.now() - startedAt;
    console.warn('[Auth Bootstrap] /api/auth/me failed', {
      elapsedMs: elapsed,
      error: error instanceof Error ? error.message : String(error),
      appUrl: clientEnv.appUrl,
      apiUrl: clientEnv.apiUrl,
    });
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isChecking, setIsChecking] = useState(true);

  const redirectUrl = searchParams.get('redirect') || '/app';

  const checkTokenAndRedirect = useCallback(async () => {
    const isAuthenticated = await hasActiveSession();
    if (isAuthenticated) {
      router.replace(redirectUrl);
    } else {
      setIsChecking(false);
    }
  }, [router, redirectUrl]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void checkTokenAndRedirect();
    }, 50);

    const guardTimer = setTimeout(() => {
      console.error('[Auth Bootstrap] isChecking guard triggered on /login, forcing form render');
      setIsChecking(false);
    }, 7000);

    return () => {
      clearTimeout(timer);
      clearTimeout(guardTimer);
    };
  }, [checkTokenAndRedirect]);

  if (isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-green-primary border-t-transparent mb-4" />
          <div className="text-text-secondary">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-text-primary">Welcome back</h1>
          <p className="mt-2 text-text-secondary">Sign in to your account to continue</p>
        </div>

        <div className="bg-bg-secondary border border-border-primary rounded-lg p-6 shadow-xl">
          <LoginForm />
        </div>

        <div className="text-center text-sm">
          <span className="text-text-secondary">Don&apos;t have an account? </span>
          <Link href="/register" className="text-green-primary hover:text-green-hover hover:underline">
            Register
          </Link>
        </div>
      </div>
    </div>
  );
}

