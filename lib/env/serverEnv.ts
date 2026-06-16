import 'server-only';
/**
 * SECURITY CRITICAL: Server-only env values.
 * If this file is imported in client code, the build will fail.
 */

const livekitApiKey = process.env.LIVEKIT_API_KEY;
const livekitSecret = process.env.LIVEKIT_API_SECRET;
const livekitUrl = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL;
const databaseUrl = process.env.DATABASE_URL;
const nodeEnv = process.env.NODE_ENV;
const nvidiaApiKey = process.env.NVIDIA_API_KEY;

export const serverEnv = {
  livekitApiKey: livekitApiKey ?? '',
  livekitSecret: livekitSecret ?? '',
  livekitUrl: livekitUrl ?? '',
  databaseUrl: databaseUrl ?? '',
  nodeEnv: nodeEnv ?? 'development',
  NVIDIA_API_KEY: (nvidiaApiKey ?? '') as string,
} as const;

export function assertServerEnv(): void {
  const missing: string[] = [];
  if (!livekitApiKey) missing.push('LIVEKIT_API_KEY');
  if (!livekitSecret) missing.push('LIVEKIT_API_SECRET');
  if (!livekitUrl) missing.push('LIVEKIT_URL or NEXT_PUBLIC_LIVEKIT_URL');
  if (!databaseUrl) missing.push('DATABASE_URL');
  if (missing.length > 0) {
    throw new Error(`Missing server env: ${missing.join(', ')}`);
  }
}
