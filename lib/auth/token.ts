/**
 * Получение access token из cookies
 * @returns access token или null, если токен не найден или код выполняется на сервере
 */
export function getAccessToken(): string | null {
  if (typeof document === 'undefined') return null;
  
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'sb-access-token' && value) {
      return decodeURIComponent(value);
    }
  }
  return null;
}

