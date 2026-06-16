// Sentry error tracking (optional for MVP)
// This is a placeholder - actual Sentry integration can be added later

export interface SentryConfig {
  dsn?: string;
  environment?: string;
}

let sentryInitialized = false;

export function initSentry(config: SentryConfig): void {
  if (!config.dsn) {
    return; // Sentry not configured
  }

  // TODO: Initialize Sentry SDK
  // import * as Sentry from '@sentry/nextjs';
  // Sentry.init({ dsn: config.dsn, environment: config.environment });

  sentryInitialized = true;
}

export function captureException(error: Error, context?: Record<string, unknown>): void {
  if (!sentryInitialized) {
    return;
  }

  // TODO: Sentry.captureException(error, { extra: context });
  console.error('Sentry would capture:', error, context);
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  if (!sentryInitialized) {
    return;
  }

  // TODO: Sentry.captureMessage(message, level);
  console.log('Sentry would capture message:', message, level);
}
