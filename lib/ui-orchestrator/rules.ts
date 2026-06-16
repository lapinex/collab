/**
 * Orchestrator rules: when to allow, veto, or modify navigation transitions.
 * Centralized rules for predictable UX.
 */

import type { UXNavigationEvent, NavigationContext, NavigationUpdate } from './state-machine';

export type RuleResult = { allow: true; update: NavigationUpdate } | { allow: false };

/**
 * Rule: Voice disconnect must NOT change the selected channel.
 * Only explicit VOICE_LEFT (user left) may switch to text channel.
 */
export function ruleVoiceDisconnectNoChannelChange(
  _ctx: NavigationContext,
  event: UXNavigationEvent
): RuleResult | null {
  if (event.type === 'VOICE_DISCONNECTED' || event.type === 'VOICE_CONNECTING') {
    return { allow: false };
  }
  return null;
}

/**
 * Rule: Reconnect must NOT reset the selected channel.
 */
export function ruleReconnectNoReset(
  _ctx: NavigationContext,
  event: UXNavigationEvent
): RuleResult | null {
  if (event.type === 'VOICE_CONNECTED') {
    return { allow: false };
  }
  return null;
}

/**
 * Rule: DM selection must NOT jump on tab switch.
 * TAB_SWITCHED to servers clears DM; to dms keeps current.
 */
export function ruleDmSelectionStable(
  _ctx: NavigationContext,
  event: UXNavigationEvent
): RuleResult | null {
  if (event.type === 'TAB_SWITCHED' && event.tab === 'dms') {
    // Switching to DMs tab: don't clear selectedDMChannelId if we're just switching
    return null; // Let state machine handle
  }
  return null;
}

const RULES: Array<(ctx: NavigationContext, event: UXNavigationEvent) => RuleResult | null> = [
  ruleVoiceDisconnectNoChannelChange,
  ruleReconnectNoReset,
];

/**
 * Applies all rules. Returns veto (allow: false) if any rule vetoes.
 * Otherwise returns the update from the state machine.
 */
export function applyRules(
  ctx: NavigationContext,
  event: UXNavigationEvent,
  machineUpdate: NavigationUpdate | null
): RuleResult | null {
  if (!machineUpdate) return null;

  for (const rule of RULES) {
    const result = rule(ctx, event);
    if (result && !result.allow) {
      return result;
    }
  }
  return { allow: true, update: machineUpdate };
}
