import postgres from 'postgres';
import { getPubSubPublisher, isFallbackMode, isRedisAvailable } from '@collab/lib/redis/pubsub';

// Lazy initialization: database connection is created only when needed
let client: ReturnType<typeof postgres> | null = null;

/**
 * Get database client with lazy initialization
 * Errors are handled gracefully - health check can report status without crashing
 */
function getDbClient(): ReturnType<typeof postgres> | null {
  if (client) {
    return client;
  }

  // Read DATABASE_URL only when database is actually needed
  const DATABASE_URL = process.env.DATABASE_URL;
  
  if (!DATABASE_URL) {
    // Don't throw here - health check will report error status
    return null;
  }

  try {
    // Создаем клиент postgres с настройками для Supabase
    client = postgres(DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
    return client;
  } catch (error) {
    console.error('Failed to initialize database in WebSocket health check:', error);
    // Не бросаем ошибку, чтобы health check мог вернуть статус ошибки
    return null;
  }
}

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  checks: {
    database: { status: 'ok' | 'error'; message?: string };
    websocket: { status: 'ok' | 'error' };
    redis: { status: 'ok' | 'error' | 'fallback'; message?: string };
  };
  timestamp: string;
}

export async function checkHealth(): Promise<HealthCheckResult> {
  const checks: HealthCheckResult['checks'] = {
    database: { status: 'error', message: 'Not checked' },
    websocket: { status: 'ok' },
    redis: { status: 'error', message: 'Not checked' },
  };

  // Check PostgreSQL
  try {
    const dbClient = getDbClient();
    if (!dbClient) {
      throw new Error('Database not initialized');
    }
    await dbClient`SELECT 1`;
    checks.database = { status: 'ok' };
  } catch (error) {
    checks.database = {
      status: 'error',
      message: error instanceof Error ? error.message : 'Database connection failed',
    };
    // Логируем детали ошибки для диагностики
    if (error instanceof Error) {
      console.error('Database health check failed in WebSocket gateway:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });
    }
  }

  // Check Redis
  try {
    if (!isRedisAvailable()) {
      checks.redis = {
        status: isFallbackMode() ? 'fallback' : 'error',
        message: isFallbackMode() ? 'Redis in fallback mode' : 'Redis unavailable',
      };
    } else {
      const redis = getPubSubPublisher();
      await redis.ping();
      checks.redis = { status: 'ok' };
    }
  } catch (error) {
    checks.redis = {
      status: 'error',
      message: error instanceof Error ? error.message : 'Redis connection failed',
    };
    console.error('Redis health check failed in WebSocket gateway:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
  }

  // Determine overall status (Redis fallback mode is acceptable)
  const criticalChecksOk = checks.database.status === 'ok' && checks.websocket.status === 'ok';
  const overallStatus = criticalChecksOk ? 'healthy' : 'unhealthy';

  return {
    status: overallStatus,
    checks,
    timestamp: new Date().toISOString(),
  };
}
