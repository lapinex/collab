/**
 * API Client для работы с fetch и автоматической обработкой cookies
 */

interface ApiClientOptions extends RequestInit {
  skipAuth?: boolean;
}

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Выполняет API запрос с автоматической обработкой cookies
 */
export async function apiRequest<T>(
  url: string,
  options: ApiClientOptions = {}
): Promise<T> {
  const { skipAuth = false, ...fetchOptions } = options;
  const { getAccessToken, clearAccessToken } = await import('@/lib/auth/access-token');
  const { refreshAccessTokenSingleFlight } = await import('@/lib/auth/refresh-singleflight');

  const headers = new Headers(fetchOptions.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getAccessToken();
  if (token && !skipAuth) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Cookies автоматически отправляются браузером, если credentials: 'include'
  let response = await fetch(url, {
    ...fetchOptions,
    headers,
    credentials: 'include',
  });

  // Single retry after refresh for bearer flows
  if (response.status === 401 && !skipAuth) {
    const refreshedToken = await refreshAccessTokenSingleFlight();
    if (refreshedToken) {
      response = await fetch(url, {
        ...fetchOptions,
        headers: {
          ...Object.fromEntries(headers.entries()),
          Authorization: `Bearer ${refreshedToken}`,
        },
        credentials: 'include',
      });
    }
  }

  // Парсим JSON ответ
  let data: T | { error: string; details?: unknown };
  try {
    const text = await response.text();
    // If response is empty and status is OK, return empty object
    if (!text.trim() && response.ok) {
      data = {} as T;
    } else {
      data = JSON.parse(text);
    }
  } catch (error) {
    // If status is OK but parsing failed, might be empty response (success)
    if (response.ok) {
      console.warn('[API] Empty or invalid JSON response but status OK, treating as success');
      data = {} as T;
    } else {
      throw new ApiError(
        'Failed to parse response',
        response.status,
        error
      );
    }
  }

  // Проверяем статус ответа
  if (!response.ok) {
    const errorMessage =
      (data as { error?: string }).error || `HTTP ${response.status}`;
    const errorDetails = (data as { details?: unknown }).details;

    // Специальная обработка для 401 - неавторизован
    if (response.status === 401 && !skipAuth) {
      // Очищаем auth state
      if (typeof window !== 'undefined') {
        const { useAuthStore } = await import('@/stores/auth-store');
        useAuthStore.getState().logout();
        clearAccessToken();
      }
    }

    throw new ApiError(errorMessage, response.status, errorDetails);
  }

  return data as T;
}

/**
 * GET запрос
 */
export async function apiGet<T>(url: string, options?: ApiClientOptions): Promise<T> {
  return apiRequest<T>(url, {
    ...options,
    method: 'GET',
  });
}

/**
 * POST запрос
 */
export async function apiPost<T>(
  url: string,
  body?: unknown,
  options?: ApiClientOptions
): Promise<T> {
  return apiRequest<T>(url, {
    ...options,
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * PATCH запрос
 */
export async function apiPatch<T>(
  url: string,
  body?: unknown,
  options?: ApiClientOptions
): Promise<T> {
  return apiRequest<T>(url, {
    ...options,
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * PUT запрос
 */
export async function apiPut<T>(
  url: string,
  body?: unknown,
  options?: ApiClientOptions
): Promise<T> {
  return apiRequest<T>(url, {
    ...options,
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * DELETE запрос
 */
export async function apiDelete<T>(url: string, options?: ApiClientOptions): Promise<T> {
  return apiRequest<T>(url, {
    ...options,
    method: 'DELETE',
  });
}

export { ApiError };
