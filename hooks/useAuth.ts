'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import {
  selectAuthError,
  selectAuthLoading,
  selectIsAuthenticated,
  selectLogout,
  selectSetError,
  selectSetLoading,
  selectSetUser,
  selectUser,
} from '@/stores/auth.selectors';
import { apiPost, apiGet, ApiError } from '@/lib/api-client';
import { setAccessToken, clearAccessToken } from '@/lib/auth/access-token';
import { syncCacheUserScope } from '@/lib/local-cache/userScope';
import { ensureLocalCacheGcStarted } from '@/lib/local-cache/gc';
import type { User } from '@/types/auth';

interface LoginCredentials {
  email: string;
  password: string;
}

interface RegisterCredentials {
  email: string;
  password: string;
  name: string;
  developerCode: string;
}

interface UseAuthOptions {
  autoCheck?: boolean;
}

export function useAuth(options: UseAuthOptions = {}) {
  const { autoCheck = true } = options;
  const router = useRouter();
  const user = useAuthStore(selectUser);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const isLoading = useAuthStore(selectAuthLoading);
  const error = useAuthStore(selectAuthError);
  const setUser = useAuthStore(selectSetUser);
  const setLoading = useAuthStore(selectSetLoading);
  const setError = useAuthStore(selectSetError);
  const logoutStore = useAuthStore(selectLogout);
  const hasCheckedRef = useRef(false);

  /**
   * Проверка текущей аутентификации. Всегда вызывает /api/auth/me при старте,
   * чтобы гидратировать access token в памяти (для RealtimeManager), даже если user восстановлен из persist.
   */
  const checkAuth = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiGet<{ user: User; accessToken?: string }>('/api/auth/me', { skipAuth: true });
      setUser(response.user);
      if (typeof response.accessToken === 'string') {
        setAccessToken(response.accessToken);
        try {
          const { getRealtimeManager } = await import('@/lib/realtime/RealtimeManager');
          getRealtimeManager().tryConnect();
        } catch (err) {
          console.error('[useAuth] Realtime connect failed (non-critical):', err);
        }
      }
      void syncCacheUserScope(response.user.id);
      ensureLocalCacheGcStarted(response.user.id);
      hasCheckedRef.current = true;
    } catch (error) {
      // Если 401, очищаем состояние и токен
      if (error instanceof ApiError && error.status === 401) {
        try {
          const { refreshAccessTokenSingleFlight } = await import('@/lib/auth/refresh-singleflight');
          const refreshedToken = await refreshAccessTokenSingleFlight();
          if (!refreshedToken) {
            throw new Error('refresh_failed');
          }
          const retried = await apiGet<{ user: User; accessToken?: string }>('/api/auth/me', { skipAuth: true });
          setUser(retried.user);
          if (typeof retried.accessToken === 'string') {
            setAccessToken(retried.accessToken);
            try {
              const { getRealtimeManager } = await import('@/lib/realtime/RealtimeManager');
              getRealtimeManager().tryConnect();
            } catch {
              // Realtime not critical for auth
            }
          }
          void syncCacheUserScope(retried.user.id);
          ensureLocalCacheGcStarted(retried.user.id);
          hasCheckedRef.current = true;
          return;
        } catch {
          logoutStore();
          clearAccessToken();
        }
      } else {
        setError(error instanceof Error ? error.message : 'Failed to check authentication');
      }
      hasCheckedRef.current = true;
    } finally {
      setLoading(false);
    }
  }, [user, setUser, setLoading, setError, logoutStore]);

  // Проверка аутентификации при монтировании (только один раз)
  useEffect(() => {
    if (!autoCheck) {
      return;
    }

    // Если уже проверяли, не делаем повторный запрос
    if (hasCheckedRef.current) {
      return;
    }

    // Всегда вызываем checkAuth (в т.ч. при user из persist), чтобы гидратировать access token для WS
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCheck]); // Пустой массив намеренно не используем из-за опции autoCheck

  const login = useCallback(async (credentials: LoginCredentials) => {
    setLoading(true);
    setError(null);

    try {
      const loginResponse = await apiPost<{ accessToken: string; user: User }>(
        '/api/auth/login',
        credentials,
        { skipAuth: true }
      );
      setAccessToken(loginResponse.accessToken);

      const response = await apiGet<{ user: User }>('/api/auth/me', { skipAuth: true });
      setUser(response.user);
      void syncCacheUserScope(response.user.id);
      ensureLocalCacheGcStarted(response.user.id);
      hasCheckedRef.current = false;
      router.push('/app');
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
          ? error.message
          : 'Login failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [setUser, setLoading, setError, router]);

  /**
   * Регистрация
   */
  const register = useCallback(async (credentials: RegisterCredentials) => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiPost<{ user: User; sessionActive?: boolean; accessToken?: string }>(
        '/api/auth/register',
        credentials,
        { skipAuth: true }
      );

      if (response.sessionActive) {
        if ((response as { accessToken?: string }).accessToken) {
          setAccessToken((response as { accessToken?: string }).accessToken ?? null);
        }
        setUser(response.user);
        void syncCacheUserScope(response.user.id);
        ensureLocalCacheGcStarted(response.user.id);
        hasCheckedRef.current = false;
        router.push('/app');
        return { success: true };
      }

      setError('Check your email to confirm your account');
      return { success: true, requiresConfirmation: true };
    } catch (error) {
      const errorMessage =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
          ? error.message
          : 'Registration failed';
      
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [setUser, setLoading, setError, router]);

  /**
   * Выход из системы
   */
  const logout = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await apiPost('/api/auth/logout', {}, { skipAuth: true });
    } catch (error) {
      // Игнорируем ошибки при выходе
      console.error('Logout error:', error);
    } finally {
      // Сбрасываем флаг проверки для возможности повторной авторизации
      hasCheckedRef.current = false;
      logoutStore();
      clearAccessToken();
      setLoading(false);
      router.push('/login');
    }
  }, [logoutStore, setLoading, setError, router]);

  return {
    user,
    isAuthenticated,
    isLoading,
    error,
    login,
    register,
    logout,
    checkAuth,
  };
}
