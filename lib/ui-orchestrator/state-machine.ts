/**
 * Lightweight FSM for chat/dm/voice navigation.
 * All navigation decisions go through send(event).
 * See docs/architecture/ux-state-machine.md for the transition graph.
 */

export type NavigationActiveTab = 'servers' | 'dms';

export type VoiceConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface NavigationContext {
  activeTab: NavigationActiveTab;
  selectedServerId: string | null;
  selectedChannelId: string | null;
  selectedDMChannelId: string | null;
  voiceConnectionState: VoiceConnectionState;
  /** Current channel is voice type (for VOICE_LEFT rule) */
  isViewingVoiceChannel: boolean;
}

export type UXNavigationEvent =
  | { type: 'DM_SELECTED'; dmId: string }
  | { type: 'SERVER_SELECTED'; serverId: string }
  | { type: 'CHANNEL_SELECTED'; channelId: string; serverId?: string }
  | { type: 'TAB_SWITCHED'; tab: NavigationActiveTab }
  | { type: 'VOICE_LEFT'; textChannelId?: string }
  | { type: 'VOICE_CONNECTING' }
  | { type: 'VOICE_CONNECTED' }
  | { type: 'VOICE_DISCONNECTED' }
  | { type: 'URL_INIT'; tab: NavigationActiveTab; serverId?: string | null; channelId?: string | null; dmId?: string | null }
  | { type: 'CLEAR_DM_SELECTION' };

export interface NavigationUpdate {
  activeTab?: NavigationActiveTab;
  selectedServerId?: string | null;
  selectedChannelId?: string | null;
  selectedDMChannelId?: string | null;
}

/**
 * Computes the navigation update for the given event and context.
 * Returns null if the event should be ignored (no transition).
 */
export function transition(
  ctx: NavigationContext,
  event: UXNavigationEvent
): NavigationUpdate | null {
  switch (event.type) {
    case 'DM_SELECTED':
      return {
        activeTab: 'dms',
        selectedDMChannelId: event.dmId,
      };

    case 'SERVER_SELECTED':
      return {
        activeTab: 'servers',
        selectedServerId: event.serverId,
        selectedChannelId: null,
        selectedDMChannelId: null,
      };

    case 'CHANNEL_SELECTED': {
      const update: NavigationUpdate = {
        activeTab: 'servers',
        selectedChannelId: event.channelId,
        selectedDMChannelId: null,
      };
      if (event.serverId) update.selectedServerId = event.serverId;
      return update;
    }

    case 'TAB_SWITCHED':
      if (event.tab === 'servers') {
        return {
          activeTab: 'servers',
          selectedDMChannelId: null,
        };
      }
      return { activeTab: event.tab };

    case 'VOICE_LEFT':
      // Rule: when leaving voice channel, switch to text channel if we were viewing voice
      if (ctx.isViewingVoiceChannel && event.textChannelId) {
        return {
          activeTab: 'servers',
          selectedChannelId: event.textChannelId,
        };
      }
      return null;

    case 'VOICE_CONNECTING':
    case 'VOICE_CONNECTED':
    case 'VOICE_DISCONNECTED':
      // Voice state changes do not change navigation by default.
      // VOICE_LEFT is the explicit "user left" event that may trigger channel switch.
      return null;

    case 'URL_INIT':
      return {
        activeTab: event.tab,
        selectedServerId: event.serverId ?? undefined,
        selectedChannelId: event.channelId ?? undefined,
        selectedDMChannelId: event.dmId ?? undefined,
      };

    case 'CLEAR_DM_SELECTION':
      return {
        activeTab: 'servers',
        selectedDMChannelId: null,
      };

    default:
      return null;
  }
}

/**
 * Merges a partial update into the current context.
 * Used to apply transition results to the store.
 */
export function applyUpdate(
  ctx: NavigationContext,
  update: NavigationUpdate
): NavigationContext {
  return {
    ...ctx,
    ...update,
  };
}
