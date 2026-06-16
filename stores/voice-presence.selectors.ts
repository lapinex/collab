import { useVoicePresenceStore } from '@/stores/voice-presence-store';

export type VoicePresenceStoreState = ReturnType<typeof useVoicePresenceStore.getState>;
const EMPTY_PARTICIPANTS: ReturnType<VoicePresenceStoreState['getChannelPresence']> = [];

export const selectVoicePresence = (state: VoicePresenceStoreState) => state.voicePresence;
export const selectVoicePresenceByChannelId = (state: VoicePresenceStoreState) => state.voicePresence.byChannelId;

export const selectSetChannelPresence = (state: VoicePresenceStoreState) => state.setChannelPresence;
export const selectMergeChannelPresence = (state: VoicePresenceStoreState) => state.mergeChannelPresence;
export const selectApplyModeration = (state: VoicePresenceStoreState) => state.applyModeration;
export const selectClearVoiceChannel = (state: VoicePresenceStoreState) => state.clearChannel;

export const selectChannelVoiceState =
  (channelId: string | null) =>
  (state: VoicePresenceStoreState) =>
    channelId ? state.voicePresence.byChannelId[channelId] ?? null : null;

export const selectVoiceParticipantsByChannelId =
  (channelId: string | null) =>
  (state: VoicePresenceStoreState) => {
    if (!channelId) return EMPTY_PARTICIPANTS;
    return state.getChannelPresence(channelId);
  };
