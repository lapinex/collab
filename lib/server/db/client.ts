import 'server-only';
/**
 * Database Client (Drizzle ORM + Postgres). Server-only.
 */
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { serverEnv } from '@/lib/server/env/serverEnv';
import * as schema from './schema';

function safeDbUrlInfo(raw?: string) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return {
      protocol: u.protocol,
      host: u.host,
      pathname: u.pathname,
    };
  } catch {
    return { raw: '<invalid url>' as const };
  }
}

// Use globalThis to persist across hot-reloads in Next.js dev mode
declare global {
  // eslint-disable-next-line no-var
  var __dbClient: ReturnType<typeof postgres> | undefined;
  // eslint-disable-next-line no-var
  var __dbInstance: PostgresJsDatabase<typeof schema> | undefined;
}

let dbInstance: PostgresJsDatabase<typeof schema> | null = null;
let client: ReturnType<typeof postgres> | null = null;

function getDb(): PostgresJsDatabase<typeof schema> {
  // Check if schema has been updated (serverInvitations should exist)
  // If using cached instance but schema is missing table, recreate
  const hasServerInvitations = 'serverInvitations' in schema;
  
  const isDev = serverEnv.nodeEnv === 'development';
  if (isDev) {
    if (global.__dbInstance && hasServerInvitations) {
      // Verify the query API has serverInvitations
      try {
        if (global.__dbInstance.query && 'serverInvitations' in global.__dbInstance.query) {
          return global.__dbInstance;
        }
      } catch {
        // If check fails, fall through to recreate
      }
    }
    if (global.__dbInstance && !hasServerInvitations) {
      console.warn('[DB] Schema updated, clearing stale cache');
      global.__dbInstance = undefined;
      dbInstance = null;
    }
  }

  if (!dbInstance) {
    const databaseUrl = serverEnv.databaseUrl;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not set');
    }

    try {
      if (isDev && global.__dbClient) {
        client = global.__dbClient;
      } else {
        const isTransactionMode = databaseUrl.includes(':6543') || databaseUrl.includes('pgbouncer=true');
        client = postgres(databaseUrl, {
          max: isDev ? 3 : (isTransactionMode ? 15 : 10), // 10 for Session mode, 15 for Transaction mode
          idle_timeout: 20,
          connect_timeout: 15,
          prepare: false,
          max_lifetime: 60 * 15, // 15 min; managed poolers can drop long-lived connections
          ssl: 'require',
        });

        if (isDev) {
          global.__dbClient = client;
        }
      }

      dbInstance = drizzle(client, { schema });

      if (!dbInstance.query?.serverInvitations) {
        console.error('[DB] Warning: serverInvitations not found in query API after initialization');
      }

      if (isDev) {
        global.__dbInstance = dbInstance;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      console.error('[DB] Failed to initialize database:', {
        message: errorMessage,
        stack: errorStack,
        hasUrl: !!databaseUrl,
        url: safeDbUrlInfo(databaseUrl),
      });
      
      throw new Error(`Database initialization failed: ${errorMessage}`);
    }
  }

  return dbInstance;
}

// Lazy getter for backward compatibility
// Connection is created on first access to any property
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop) {
    const db = getDb();
    const value = db[prop as keyof typeof db];
    // Bind function context
    if (typeof value === 'function') {
      return value.bind(db);
    }
    return value;
  },
}) as PostgresJsDatabase<typeof schema>;

export type Database = PostgresJsDatabase<typeof schema>;

/**
 * Check if error is a transient network error that can be retried
 */
function isTransientDbNetworkError(err: unknown): boolean {
  const code = (err as { code?: unknown })?.code;
  if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ECONNREFUSED' || code === 'CONNECTION_ENDED') {
    return true;
  }

  // Check for managed pooler errors
  const message = (err as { message?: string })?.message || '';
  if (message.includes('MaxClientsInSessionMode') || message.includes('max clients reached')) {
    return true; // Pool exhausted, retry after delay
  }

  // postgres-js/drizzle sometimes nest the real error in `cause`
  const cause = (err as { cause?: unknown })?.cause as { code?: unknown; message?: string } | undefined;
  const causeCode = cause?.code;
  const causeMessage = cause?.message || '';
  
  if (causeCode === 'ECONNRESET' || causeCode === 'ETIMEDOUT' || causeCode === 'ECONNREFUSED' || causeCode === 'CONNECTION_ENDED') {
    return true;
  }
  
  if (causeMessage.includes('MaxClientsInSessionMode') || causeMessage.includes('max clients reached')) {
    return true;
  }
  
  return false;
}

// Retry delays with exponential backoff
// Longer delays for pool exhaustion errors
const RETRY_DELAYS_MS = [500, 1000, 2000];

/**
 * Execute a database operation with automatic retry on transient network errors.
 * Managed poolers can drop connections (ECONNRESET); retry up to 2 times
 * with backoff after closing and recreating the connection.
 */
export async function withDbRetry<T>(
  operation: () => Promise<T>,
  context?: string
): Promise<T> {
  const maxRetries = RETRY_DELAYS_MS.length;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      const isTransient = isTransientDbNetworkError(err);
      const done = !isTransient || attempt >= maxRetries;
      
      if (done) {
        // Log final error with context
        const ctx = context ? `[${context}]` : '';
        const errMsg = (err as Error)?.message || String(err);
        if (isTransient) {
          console.error(`${ctx} DB transient error after ${attempt + 1} retries:`, errMsg);
        }
        throw err;
      }
      
      const ctx = context ? `[${context}]` : '';
      const errMsg = (err as Error)?.message || String(err);
      const isPoolExhausted = errMsg.includes('MaxClientsInSessionMode') || errMsg.includes('max clients reached');
      
      if (isPoolExhausted) {
        console.warn(`${ctx} DB pool exhausted, retry ${attempt + 1}/${maxRetries} after ${RETRY_DELAYS_MS[attempt]}ms`);
      } else {
        console.warn(`${ctx} Transient DB network error, retry ${attempt + 1}/${maxRetries}:`, errMsg);
      }
      
      try {
        // Close connection to free up pool slot
        await closeDatabase();
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      } catch {
        /* ignore */
      }
    }
  }
  throw new Error('withDbRetry: unreachable');
}

/**
 * Close database connection gracefully
 * Useful for graceful shutdown in serverless environments
 */
export async function closeDatabase(): Promise<void> {
  if (client) {
    await client.end();
    client = null;
    dbInstance = null;
    
    if (serverEnv.nodeEnv === 'development') {
      global.__dbClient = undefined;
      global.__dbInstance = undefined;
    }
  }
}

/**
 * Force reset database client cache
 * Useful when schema changes in development mode
 */
export function resetDatabaseCache(): void {
  dbInstance = null;
  if (serverEnv.nodeEnv === 'development') {
    global.__dbInstance = undefined;
  }
}
