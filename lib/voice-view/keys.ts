/**
 * VoiceView slice query keys. Single source of truth for voice cache.
 * No refs/useState for participants or connectionState — only these slices.
 */

export const vvRoomKey = (channelId: string) =>
  ['vv:room', channelId] as const;
export const vvParticipantsKey = (channelId: string) =>
  ['vv:participants', channelId] as const;
export const vvOrderKey = (channelId: string) =>
  ['vv:order', channelId] as const;
export const vvMetaKey = (channelId: string) =>
  ['vv:meta', channelId] as const;

/** Active voice channel (global). Set on connect, cleared on disconnect. */
export const vvActiveChannelKey = () => ['vv:activeChannelId'] as const;

/** Display name of the voice channel (set when joining). */
export const vvChannelNameKey = (channelId: string) =>
  ['vv:channelName', channelId] as const;

export type VoiceConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

export interface VoiceRoomSlice {
  connectionState: VoiceConnectionState;
}

export interface VoiceParticipant {
  id: string;
  sid: string;
  userId: string | null;
  name: string;
  avatarUrl: string | null;
  isMuted: boolean;
  isSpeaking: boolean;
  isScreenSharing?: boolean;
}

export interface VoiceMetaSlice {
  canSpeak: boolean;
  micId: string | null;
  speakerId: string | null;
  isMuted: boolean;
  isDeafened: boolean;
  isScreenSharing: boolean;
  /** SID of participant currently sharing screen (Room events only). Used to trigger UI re-render. */
  screenParticipantSid: string | null;
}

export type ParticipantsSlice = Record<string, VoiceParticipant>;
export type OrderSlice = string[];
