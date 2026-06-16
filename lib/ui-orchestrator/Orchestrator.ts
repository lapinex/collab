/**
 * UI Orchestrator — single entry point for navigation decisions.
 * Wraps state machine with rules and observability.
 */

import { transition, type UXNavigationEvent, type NavigationContext, type NavigationUpdate } from './state-machine';
import { applyRules } from './rules';
import { logTransition, logVeto } from '@/lib/ux-observability/logger';

export type OrchestratorSend = (event: UXNavigationEvent) => void;

export type ApplyUpdatesFn = (update: NavigationUpdate) => void;

/**
 * Creates the orchestrator send function.
 * Applies rules, logs, then applies updates to the store.
 */
export function createOrchestratorSend(
  getContext: () => NavigationContext,
  applyUpdates: ApplyUpdatesFn
): OrchestratorSend {
  return (event: UXNavigationEvent) => {
    const ctx = getContext();
    const machineUpdate = transition(ctx, event);

    const ruleResult = applyRules(ctx, event, machineUpdate);
    if (!ruleResult) return;
    if (!ruleResult.allow) {
      logVeto(event, ctx);
      return;
    }

    const update = ruleResult.update;
    logTransition(event, ctx, update);
    applyUpdates(update);
  };
}
