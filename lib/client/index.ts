/**
 * Клиентская часть lib — безопасна для браузера.
 * Реэкспорт основных точек входа для импорта как @/lib/client
 */

export {
  apiRequest,
  apiGet,
  apiPost,
  apiPut,
  apiPatch,
  apiDelete,
  ApiError,
} from '@/lib/api-client';

export { clientEnv, assertClientEnv } from '@/lib/env/clientEnv';
