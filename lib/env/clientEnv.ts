/**
 * SECURITY CRITICAL:
 * This file is part of secret isolation architecture.
 * Only NEXT_PUBLIC_* and NODE_ENV are allowed here — safe for browser bundle.
 * Do NOT add server secrets. Do NOT import serverEnv or any server-only code.
 */

const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;
const appUrl = process.env.NEXT_PUBLIC_APP_URL;
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
const giphyApiKey = process.env.NEXT_PUBLIC_GIPHY_API_KEY ?? '';
const nodeEnv = process.env.NODE_ENV;
const nextPhase = process.env.NEXT_PHASE;

export const clientEnv = {
  livekitUrl: livekitUrl ?? '',
  appUrl: appUrl ?? '',
  apiUrl,
  wsUrl: wsUrl ?? '',
  giphyApiKey,
  nodeEnv: nodeEnv ?? 'development',
  nextPhase: nextPhase ?? '',
} as const;

export function assertClientEnv(): void {
  const missing: string[] = [];
  if (!appUrl) missing.push('NEXT_PUBLIC_APP_URL');
  // apiUrl has fallback to http://localhost:4000, no need to require
  if (!wsUrl) missing.push('NEXT_PUBLIC_WS_URL');
  if (missing.length > 0) {
    throw new Error(`Missing client env: ${missing.join(', ')}`);
  }
}
