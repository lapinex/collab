/**
 * Bootstrap module for WebSocket Gateway
 * 
 * This module MUST be imported FIRST before any other modules that use process.env
 * It loads .env.gateway file and ensures environment variables are available.
 * 
 * IMPORTANT: This file should have NO side effects except loading environment variables.
 * All other initialization should happen in server.ts after bootstrap is imported.
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Find .env.gateway file in multiple possible locations:
 * 1. Project root (if running from project root)
 * 2. services/websocket-gateway/ (relative to gateway src)
 * 3. Current working directory
 */
function findEnvFile(): string | undefined {
  const possiblePaths = [
    // Project root (when running from project root)
    resolve(process.cwd(), '.env.gateway'),
    // services/websocket-gateway/ (when running from project root)
    resolve(process.cwd(), 'services', 'websocket-gateway', '.env.gateway'),
    // Relative to gateway src directory
    join(__dirname, '../../.env.gateway'),
    join(__dirname, '../../../.env.gateway'),
    join(__dirname, '../../../../.env.gateway'),
  ];

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  return undefined;
}

/**
 * Bootstrap environment variables
 * Loads .env.gateway file without overriding system environment variables
 */
export function bootstrapEnv(): void {
  const envPath = findEnvFile();

  if (envPath) {
    // Load .env.gateway but don't override existing system/env vars (Railway, Docker, etc.)
    // System environment variables have priority
    const result = config({ path: envPath, override: false });
    
    if (result.error) {
      console.warn(`[Gateway Bootstrap] Warning: Failed to load .env.gateway from ${envPath}:`, result.error);
    } else {
      console.log(`[Gateway Bootstrap] Loaded environment from: ${envPath}`);
    }
  } else {
    // Silently continue - use system env vars or Railway/Docker-provided vars
    console.log('[Gateway Bootstrap] .env.gateway not found, using system environment variables');
  }
}

// Auto-execute bootstrap when module is imported
bootstrapEnv();
