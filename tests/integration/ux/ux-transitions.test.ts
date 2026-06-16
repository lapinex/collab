/**
 * Integration tests for UX transitions.
 * Scenarios from ARCHITECTURE_PHASE3.md:
 * - Voice disconnect не меняет канал без явной причины
 * - DM selection не прыгает
 * - Reconnect не сбрасывает выбранный канал
 */

import { describe, it, expect } from '@jest/globals';
import {
  transition,
  type NavigationContext,
} from '@/lib/ui-orchestrator/state-machine';
import { applyRules } from '@/lib/ui-orchestrator/rules';
import { createOrchestratorSend } from '@/lib/ui-orchestrator/Orchestrator';

function baseContext(overrides?: Partial<NavigationContext>): NavigationContext {
  return {
    activeTab: 'servers',
    selectedServerId: 's1',
    selectedChannelId: 'ch1',
    selectedDMChannelId: null,
    voiceConnectionState: 'connected',
    isViewingVoiceChannel: false,
    ...overrides,
  };
}

describe('UX Transitions — State Machine', () => {
  it('VOICE_DISCONNECTED does not change channel (returns null)', () => {
    const ctx = baseContext({ selectedChannelId: 'ch1' });
    const result = transition(ctx, { type: 'VOICE_DISCONNECTED' });
    expect(result).toBeNull();
  });

  it('VOICE_CONNECTING does not change channel (returns null)', () => {
    const ctx = baseContext({ selectedChannelId: 'ch1' });
    const result = transition(ctx, { type: 'VOICE_CONNECTING' });
    expect(result).toBeNull();
  });

  it('VOICE_CONNECTED does not reset channel (returns null)', () => {
    const ctx = baseContext({ selectedChannelId: 'ch1' });
    const result = transition(ctx, { type: 'VOICE_CONNECTED' });
    expect(result).toBeNull();
  });

  it('VOICE_LEFT with textChannelId when viewing voice channel switches to text', () => {
    const ctx = baseContext({
      selectedChannelId: 'voice-ch1',
      isViewingVoiceChannel: true,
    });
    const result = transition(ctx, { type: 'VOICE_LEFT', textChannelId: 'text-ch1' });
    expect(result).toEqual({
      activeTab: 'servers',
      selectedChannelId: 'text-ch1',
    });
  });

  it('VOICE_LEFT without textChannelId returns null', () => {
    const ctx = baseContext({ isViewingVoiceChannel: true });
    const result = transition(ctx, { type: 'VOICE_LEFT' });
    expect(result).toBeNull();
  });

  it('DM_SELECTED sets DM and tab', () => {
    const ctx = baseContext({ activeTab: 'servers' });
    const result = transition(ctx, { type: 'DM_SELECTED', dmId: 'dm1' });
    expect(result).toEqual({
      activeTab: 'dms',
      selectedDMChannelId: 'dm1',
    });
  });

  it('TAB_SWITCHED to servers clears DM selection', () => {
    const ctx = baseContext({ activeTab: 'dms', selectedDMChannelId: 'dm1' });
    const result = transition(ctx, { type: 'TAB_SWITCHED', tab: 'servers' });
    expect(result).toEqual({
      activeTab: 'servers',
      selectedDMChannelId: null,
    });
  });

  it('TAB_SWITCHED to dms keeps current state', () => {
    const ctx = baseContext({ activeTab: 'servers', selectedDMChannelId: 'dm1' });
    const result = transition(ctx, { type: 'TAB_SWITCHED', tab: 'dms' });
    expect(result).toEqual({ activeTab: 'dms' });
  });
});

describe('UX Transitions — Rules', () => {
  it('applyRules vetoes VOICE_DISCONNECTED when machine would return update', () => {
    // If machine returned an update (hypothetically), rules would veto
    const ctx = baseContext();
    const result = applyRules(ctx, { type: 'VOICE_DISCONNECTED' }, {
      activeTab: 'servers',
      selectedChannelId: 'other',
    });
    expect(result).not.toBeNull();
    expect(result?.allow).toBe(false);
  });

  it('applyRules vetoes VOICE_CONNECTED when machine would return update', () => {
    const ctx = baseContext();
    const result = applyRules(ctx, { type: 'VOICE_CONNECTED' }, {
      selectedChannelId: null,
    });
    expect(result).not.toBeNull();
    expect(result?.allow).toBe(false);
  });

  it('applyRules allows DM_SELECTED', () => {
    const ctx = baseContext();
    const update = { activeTab: 'dms' as const, selectedDMChannelId: 'dm1' };
    const result = applyRules(ctx, { type: 'DM_SELECTED', dmId: 'dm1' }, update);
    expect(result).toEqual({ allow: true, update });
  });
});

describe('UX Transitions — Orchestrator send', () => {
  it('send(VOICE_DISCONNECTED) does not call applyUpdates', () => {
    const updates: unknown[] = [];
    const applyUpdates = (u: unknown) => updates.push(u);
    const getContext = () => baseContext({ selectedChannelId: 'ch1' });
    const send = createOrchestratorSend(getContext, applyUpdates);

    send({ type: 'VOICE_DISCONNECTED' });

    expect(updates).toHaveLength(0);
  });

  it('send(VOICE_CONNECTED) does not call applyUpdates', () => {
    const updates: unknown[] = [];
    const applyUpdates = (u: unknown) => updates.push(u);
    const getContext = () => baseContext({ selectedChannelId: 'ch1' });
    const send = createOrchestratorSend(getContext, applyUpdates);

    send({ type: 'VOICE_CONNECTED' });

    expect(updates).toHaveLength(0);
  });

  it('send(DM_SELECTED) calls applyUpdates', () => {
    const updates: unknown[] = [];
    const applyUpdates = (u: unknown) => updates.push(u);
    const getContext = () => baseContext();
    const send = createOrchestratorSend(getContext, applyUpdates);

    send({ type: 'DM_SELECTED', dmId: 'dm1' });

    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({
      activeTab: 'dms',
      selectedDMChannelId: 'dm1',
    });
  });

  it('send(VOICE_LEFT) with textChannelId when viewing voice calls applyUpdates', () => {
    const updates: unknown[] = [];
    const applyUpdates = (u: unknown) => updates.push(u);
    const getContext = () =>
      baseContext({
        selectedChannelId: 'voice-ch1',
        isViewingVoiceChannel: true,
      });
    const send = createOrchestratorSend(getContext, applyUpdates);

    send({ type: 'VOICE_LEFT', textChannelId: 'text-ch1' });

    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({
      activeTab: 'servers',
      selectedChannelId: 'text-ch1',
    });
  });
});
