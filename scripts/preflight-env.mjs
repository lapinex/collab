import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env');

if (!existsSync(envPath)) {
  console.error('[preflight] Missing .env file in project root.');
  console.error('[preflight] Copy .env.example -> .env and fill production values.');
  process.exit(1);
}

const raw = readFileSync(envPath, 'utf8');
const entries = new Map();
for (const line of raw.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq <= 0) continue;
  const key = trimmed.slice(0, eq).trim();
  const value = trimmed.slice(eq + 1).trim();
  entries.set(key, value);
}

const required = [
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_API_URL',
  'NEXT_PUBLIC_WS_URL',
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'WS_JWT_SECRET',
  'CORS_ORIGIN',
  'WS_ALLOWED_ORIGIN',
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET',
  'MEDIA_PUBLIC_BASE_URL',
];

const placeholderFragments = [
  'change_me',
  'replace_with',
  'example.com',
  'localhost',
  'devkey',
  'devsecret',
];

const missing = [];
const insecure = [];

for (const key of required) {
  const value = entries.get(key);
  if (!value) {
    missing.push(key);
    continue;
  }
  const lowered = value.toLowerCase();
  if (placeholderFragments.some((s) => lowered.includes(s))) {
    insecure.push(`${key}=${value}`);
  }
}

if (missing.length > 0 || insecure.length > 0) {
  if (missing.length > 0) {
    console.error('[preflight] Missing required variables:');
    for (const key of missing) console.error(`  - ${key}`);
  }
  if (insecure.length > 0) {
    console.error('[preflight] Placeholder or insecure values detected:');
    for (const item of insecure) console.error(`  - ${item}`);
  }
  process.exit(1);
}

console.log('[preflight] Environment looks valid for production deploy.');
