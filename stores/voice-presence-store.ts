'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { EntityMap, VoiceChannelEntityState } from '@/stores/types';

/**
 * Global Voice Presence (Discord-style).
 * UI reads ONLY from this store. Data comes from:
 * - GET /api/voice/participants (who is in channel when not joined)
 * - VoiceSession sync when user is in channel (real-time mute/speaking/screen)
 */

export interface VoicePresenceParticipant {
  sid: string;
  identity: string;
  userId: string | null;
  name: string;
  avatarUrl: string | null;
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking: boolean;
  isScreenSharing: boolean;
}

export interface ChannelVoicePresence {
  participantsById: EntityMap<VoicePresenceParticipant>;
  participantIds: string[];
  sidToParticipantId: Record<string, string>;
  userIdToParticipantId: Record<string, string>;
}

interface VoicePresenceState {
  voicePresence: {
    byChannelId: Record<string, ChannelVoicePresence>;
  };

  setChannelPresence: (channelId: string, participants: VoicePresenceParticipant[]) => void;
  mergeChannelPresence: (channelId: string, participants: VoicePresenceParticipant[]) => void;
  applyModeration: (channelId: string, userId: string, state: { muted?: boolean; deafened?: boolean }) => void;
  clearChannel: (channelId: string) => void;
  getChannelPresence: (channelId: string) => VoicePresenceParticipant[];
}

function normalizeParticipants(
  participants: VoicePresenceParticipant[]
): VoiceChannelEntityState<VoicePresenceParticipant> {
  const participantsById: EntityMap<VoicePresenceParticipant> = {};
  const participantIds: string[] = [];
  const sidToParticipantId: Record<string, string> = {};
  const userIdToParticipantId: Record<string, string> = {};

  for (const participant of participants) {
    const id = participant.sid;
    participantsById[id] = participant;
    participantIds.push(id);
    sidToParticipantId[participant.sid] = id;
    if (participant.userId) {
      userIdToParticipantId[participant.userId] = id;
    }
  }

  return {
    participantsById,
    participantIds,
    sidToParticipantId,
    userIdToParticipantId,
  };
}

function denormalizeParticipants(channelState?: ChannelVoicePresence): VoicePresenceParticipant[] {
  if (!channelState) return [];
  return channelState.participantIds
    .map((id) => channelState.participantsById[id])
    .filter((participant): participant is VoicePresenceParticipant => participant != null);
}

export const useVoicePresenceStore = create<VoicePresenceState>()(
  devtools(
    (set, get) => ({
      voicePresence: {
        byChannelId: {},
      },

      setChannelPresence: (channelId, participants) =>
        set(
          (state) => ({
            voicePresence: {
              byChannelId: {
                ...state.voicePresence.byChannelId,
                [channelId]: normalizeParticipants(participants),
              },
            },
          }),
          false,
          'voicePresence/setChannelPresence'
        ),

      mergeChannelPresence: (channelId, participants) =>
        set(
          (state) => {
            const current = denormalizeParticipants(state.voicePresence.byChannelId[channelId]);
            const bySid = new Map(current.map((participant) => [participant.sid, participant]));
            const byUserId = new Map(current.filter((participant) => participant.userId).map((participant) => [participant.userId!, participant]));
            for (const participant of participants) {
              const existing =
                bySid.get(participant.sid) ??
                (participant.userId ? byUserId.get(participant.userId) : undefined);
              bySid.set(participant.sid, {
                ...participant,
                isDeafened: existing?.isDeafened ?? participant.isDeafened,
              });
            }
            return {
              voicePresence: {
                byChannelId: {
                  ...state.voicePresence.byChannelId,
                  [channelId]: normalizeParticipants(Array.from(bySid.values())),
                },
              },
            };
          },
          false,
          'voicePresence/mergeChannelPresence'
        ),

      applyModeration: (channelId, userId, patch) =>
        set(
          (state) => {
            const channelState = state.voicePresence.byChannelId[channelId];
            if (!channelState) {
              return state;
            }
            const participantId = channelState.userIdToParticipantId[userId];
            if (!participantId) {
              return state;
            }
            const participant = channelState.participantsById[participantId];
            if (!participant) {
              return state;
            }
            const updatedParticipant: VoicePresenceParticipant = {
              ...participant,
              isMuted: patch.muted ?? participant.isMuted,
              isDeafened: patch.deafened ?? participant.isDeafened,
            };
            const nextChannelState: ChannelVoicePresence = {
              ...channelState,
              participantsById: {
                ...channelState.participantsById,
                [participantId]: updatedParticipant,
              },
            };
            return {
              voicePresence: {
                byChannelId: {
                  ...state.voicePresence.byChannelId,
                  [channelId]: nextChannelState,
                },
              },
            };
          },
          false,
          'voicePresence/applyModeration'
        ),

      clearChannel: (channelId) =>
        set(
          (state) => {
            const next = { ...state.voicePresence.byChannelId };
            delete next[channelId];
            return {
              voicePresence: {
                byChannelId: next,
              },
            };
          },
          false,
          'voicePresence/clearChannel'
        ),

      getChannelPresence: (channelId) => denormalizeParticipants(get().voicePresence.byChannelId[channelId]),
    }),
    {
      name: 'voice-presence-store',
      enabled: process.env.NODE_ENV === 'development',
    }
  )
);
