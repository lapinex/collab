/**
 * UX Observability — dev-only logger for navigation transitions.
 * Not enabled in production by default.
 */

import type { UXNavigationEvent, NavigationContext, NavigationUpdate } from '@/lib/ui-orchestrator/state-machine';

const PREFIX = '[UX]';

function isDev(): boolean {
  return typeof process !== 'undefined' && process.env.NODE_ENV === 'development';
}

/**
 * Logs a navigation transition (dev only).
 */
export function logTransition(
  event: UXNavigationEvent,
  _ctx: NavigationContext,
  update: NavigationUpdate
): void {
  if (!isDev()) return;
  console.debug(`${PREFIX} transition`, event.type, update);
}

/**
 * Logs when a rule vetoes a transition (dev only).
 */
export function logVeto(event: UXNavigationEvent, _ctx: NavigationContext): void {
  if (!isDev()) return;
  console.debug(`${PREFIX} veto`, event.type);
}

/**
 * Logs unexpected auto-switch (for future observability).
 */
export function logUnexpectedAutoSwitch(reason: string, from: string, to: string): void {
  if (!isDev()) return;
  console.warn(`${PREFIX} unexpected auto-switch: ${reason}`, { from, to });
}
