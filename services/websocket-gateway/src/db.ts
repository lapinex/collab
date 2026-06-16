import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '@collab/lib/db/schema';

// Lazy initialization: database connection is created only when getDb() is called
let client: ReturnType<typeof postgres> | null = null;
let db: PostgresJsDatabase<typeof schema> | null = null;

/**
 * Get database instance with lazy initialization
 * DATABASE_URL is read only when database is actually needed (not at import time)
 * 
 * @throws Error if DATABASE_URL is not set when getDb() is called
 */
export function getDb(): PostgresJsDatabase<typeof schema> {
  if (db) {
    return db;
  }

  // Read DATABASE_URL only when database is actually needed
  const DATABASE_URL = process.env.DATABASE_URL;
  
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  // Supabase-friendly postgres-js config
  client = postgres(DATABASE_URL, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false, // for Supabase pooler
  });

  db = drizzle(client, { schema });
  return db;
}

