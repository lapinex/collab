/**
 * Pure patchers for VoiceView slices. LiveKit events apply via these.
 * Never invalidate — only setQueryData with patcher result.
 */

import type {
  VoiceRoomSlice,
  VoiceParticipant,
  VoiceMetaSlice,
  ParticipantsSlice,
  OrderSlice,
} from './keys';

export function patchRoomState(
  _prev: VoiceRoomSlice | undefined,
  connectionState: VoiceRoomSlice['connectionState']
): VoiceRoomSlice {
  return { connectionState };
}

/**
 * Add participant. Key MUST be LiveKit identity (participant.id), not sid.
 * Invariant: vv:order never contains the same identity more than once (dedupe on rejoin).
 */
export function patchParticipantConnected(
  participants: ParticipantsSlice,
  order: OrderSlice,
  participant: VoiceParticipant
): { participants: ParticipantsSlice; order: OrderSlice } {
  const identity = participant.id;
  const newParticipants = { ...participants, [identity]: participant };
  const newOrder = [...order.filter((id) => id !== identity), identity];
  return { participants: newParticipants, order: newOrder };
}

export function patchParticipantDisconnected(
  participants: ParticipantsSlice,
  order: OrderSlice,
  userIdOrIdentity: string
): { participants: ParticipantsSlice; order: OrderSlice } {
  const key = userIdOrIdentity;
  const { [key]: _, ...rest } = participants;
  const newOrder = order.filter((id) => id !== key);
  return { participants: rest, order: newOrder };
}

export function patchMeta(
  prev: VoiceMetaSlice | undefined,
  updates: Partial<VoiceMetaSlice>
): VoiceMetaSlice {
  const base: VoiceMetaSlice = prev ?? {
    canSpeak: true,
    micId: null,
    speakerId: null,
    isMuted: false,
    isDeafened: false,
    isScreenSharing: false,
    screenParticipantSid: null,
  };
  return { ...base, ...updates };
}
