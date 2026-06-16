/**
 * VoiceSession — single source of truth for the voice channel.
 * Only VoiceSession may change room state, participants, speaking, and audio attach/detach.
 * All other parts (roomController, vv:* slices, UI) are passive subscribers.
 * Receives audioLayer from runtime (no React).
 */

import {
  Room,
  Track,
  RemoteAudioTrack,
  RemoteVideoTrack,
  RemoteParticipant,
  LocalParticipant,
} from 'livekit-client';
import type { VoiceParticipant, VoiceConnectionState, VoiceMetaSlice } from '@/lib/voice-view/keys';
import type { ParticipantsSlice, OrderSlice } from '@/lib/voice-view/keys';

export interface IVoiceAudioLayer {
  attach(identity: string, track: RemoteAudioTrack): void;
  detach(identity: string): void;
  detachAll(): void;
}

const DEFAULT_META: VoiceMetaSlice = {
  canSpeak: true,
  micId: null,
  speakerId: null,
  isMuted: false,
  isDeafened: false,
  isScreenSharing: false,
  screenParticipantSid: null,
};

const ROOM_STATE_STABILIZE_MS = 600;
const DISCONNECT_GRACE_MS = 8000;

export type SessionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface VoiceSessionSnapshot {
  channelId: string | null;
  state: SessionState;
  connectionState: VoiceConnectionState;
  participants: ParticipantsSlice;
  order: OrderSlice;
  speaking: string[];
  channelName: string | null;
  meta: VoiceMetaSlice;
}

type Listener = (snapshot: VoiceSessionSnapshot) => void;

function parseMetadata(metadata?: string): { userId?: string; nickname?: string; avatar?: string } | null {
  if (!metadata) return null;
  try {
    return JSON.parse(metadata) as { userId?: string; nickname?: string; avatar?: string };
  } catch {
    return null;
  }
}

function toVoiceParticipant(
  identity: string,
  sid: string,
  metadata: string | undefined,
  name: string,
  isMuted: boolean,
  isSpeaking: boolean,
  isScreenSharing: boolean
): VoiceParticipant {
  const meta = parseMetadata(metadata);
  const userId = meta?.userId ?? identity.split('_')[0] ?? null;
  return {
    id: identity,
    sid,
    userId,
    name: name || meta?.nickname || 'User',
    avatarUrl: meta?.avatar ?? null,
    isMuted,
    isSpeaking,
    isScreenSharing,
  };
}

function hasScreenTrack(p: LocalParticipant | RemoteParticipant): boolean {
  for (const pub of p.videoTrackPublications.values()) {
    if (pub.source === Track.Source.ScreenShare) return true;
  }
  return false;
}

function mapParticipant(
  p: LocalParticipant | RemoteParticipant,
  speakingIds: Set<string>
): VoiceParticipant {
  const isMuted = p.isMicrophoneEnabled === false;
  const name = p instanceof LocalParticipant ? (p.name ?? 'You') : (p.name ?? 'User');
  return toVoiceParticipant(
    p.identity,
    p.sid,
    p.metadata,
    name,
    isMuted,
    speakingIds.has(p.identity),
    hasScreenTrack(p)
  );
}

export class VoiceSessionImpl {
  private readonly audioLayer: IVoiceAudioLayer;
  private channelId: string | null = null;
  private channelName: string | null = null;
  private state: SessionState = 'idle';
  private participants = new Map<string, VoiceParticipant>();
  private order: string[] = [];
  private speaking = new Set<string>();
  private meta: VoiceMetaSlice = { ...DEFAULT_META };
  private listeners = new Set<Listener>();

  constructor(audioLayer: IVoiceAudioLayer) {
    this.audioLayer = audioLayer;
  }

  private stabilizerTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingStabilizerState: VoiceConnectionState | null = null;
  private disconnectGraceTimer: ReturnType<typeof setTimeout> | null = null;

  private roomRef: Room | null = null;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): VoiceSessionSnapshot {
    const participants: ParticipantsSlice = {};
    this.participants.forEach((v, id) => {
      participants[id] = v;
    });
    const connectionState: VoiceConnectionState =
      this.state === 'idle' ? 'disconnected' : this.state;
    return {
      channelId: this.channelId,
      state: this.state,
      connectionState,
      participants,
      order: [...this.order],
      speaking: [...this.speaking],
      channelName: this.channelName,
      meta: { ...this.meta },
    };
  }

  setMeta(updates: Partial<VoiceMetaSlice>): void {
    this.meta = { ...this.meta, ...updates };
    this.emit();
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((l) => l(snapshot));
  }

  private setState(next: SessionState): void {
    if (this.state === next) return;
    this.state = next;
    this.emit();
  }

  private setConnectionStateForUI(s: VoiceConnectionState): void {
    if (s === 'disconnected') {
      this.clearStabilizer();
      this.setState('disconnected');
    } else if (s === 'connected') {
      this.setState('connected');
    } else if (s === 'reconnecting') {
      this.setState('reconnecting');
    } else if (s === 'connecting') {
      this.setState('connecting');
    }
    this.emit();
  }

  private stabilizeRoomState(next: VoiceConnectionState): void {
    if (this.stabilizerTimer) clearTimeout(this.stabilizerTimer);
    this.pendingStabilizerState = next;
    this.stabilizerTimer = setTimeout(() => {
      this.stabilizerTimer = null;
      const s = this.pendingStabilizerState;
      this.pendingStabilizerState = null;
      if (s) this.setConnectionStateForUI(s);
    }, ROOM_STATE_STABILIZE_MS);
  }

  private clearStabilizer(): void {
    if (this.stabilizerTimer) {
      clearTimeout(this.stabilizerTimer);
      this.stabilizerTimer = null;
    }
    this.pendingStabilizerState = null;
  }

  private clearDisconnectGrace(): void {
    if (this.disconnectGraceTimer) {
      clearTimeout(this.disconnectGraceTimer);
      this.disconnectGraceTimer = null;
    }
  }

  private startDisconnectGrace(): void {
    if (this.disconnectGraceTimer) return;
    this.disconnectGraceTimer = setTimeout(() => {
      this.disconnectGraceTimer = null;
      this.audioLayer.detachAll();
      this.participants.clear();
      this.order = [];
      this.speaking.clear();
      this.setState('disconnected');
      this.channelId = null;
      this.channelName = null;
      this.meta = { ...DEFAULT_META };
      this.roomRef = null;
      this.emit();
    }, DISCONNECT_GRACE_MS);
  }

  /**
   * Full rebuild of participants from Room. Called on every RoomEvent that affects participants/tracks.
   * No incremental add/remove — UI is a direct reflection of Room.
   */
  rebuildVoiceParticipantsFromRoom(): void {
    const room = this.roomRef;
    if (!room) return;

    this.audioLayer.detachAll();

    const allParticipants: (LocalParticipant | RemoteParticipant)[] = [
      room.localParticipant,
      ...room.remoteParticipants.values(),
    ];

    const next = new Map<string, VoiceParticipant>();
    const nextOrder: string[] = [];

    for (const p of allParticipants) {
      const v = mapParticipant(p, this.speaking);
      const participant: VoiceParticipant = {
        ...v,
        isScreenSharing: hasScreenTrack(p),
      };
      next.set(p.identity, participant);
      nextOrder.push(p.identity);
    }

    for (const p of room.remoteParticipants.values()) {
      for (const pub of p.audioTrackPublications.values()) {
        if (pub.track && pub.track instanceof RemoteAudioTrack) {
          this.audioLayer.attach(p.identity, pub.track);
        }
      }
    }

    this.participants = next;
    this.order = nextOrder;
    this.emit();
  }

  /** Called when user or adapter starts connect. Sets connecting and channel. */
  startConnect(channelId: string, opts?: { channelName?: string | null }): void {
    this.channelId = channelId;
    this.channelName = opts?.channelName ?? null;
    this.meta = { ...DEFAULT_META };
    this.setState('connecting');
    this.emit();
  }

  /** User-initiated disconnect: immediate cleanup, no grace. */
  disconnect(_byUser: boolean): void {
    this.clearDisconnectGrace();
    this.clearStabilizer();
    this.audioLayer.detachAll();
    this.participants.clear();
    this.order = [];
    this.speaking.clear();
    this.setState('disconnected');
    this.channelId = null;
    this.channelName = null;
    this.meta = { ...DEFAULT_META };
    this.roomRef = null;
    this.emit();
  }

  /** Register room reference for event handlers (roomController passes it). */
  setRoomRef(room: Room | null): void {
    this.roomRef = room;
  }

  getChannelId(): string | null {
    return this.channelId;
  }

  getState(): SessionState {
    return this.state;
  }

  // ---------- LiveKit event handlers (called only by roomController adapter) ----------

  /** Only stabilizes non-disconnected states. 'disconnected' is handled by handleDisconnected (grace). */
  handleConnectionStateChanged(connectionState: VoiceConnectionState): void {
    if (connectionState === 'disconnected') return;
    this.stabilizeRoomState(connectionState);
  }

  handleReconnecting(): void {
    this.stabilizeRoomState('reconnecting');
  }

  handleReconnected(): void {
    this.clearDisconnectGrace();
    this.stabilizeRoomState('connected');
  }

  handleConnected(room: Room): void {
    this.clearDisconnectGrace();
    this.setRoomRef(room);
    this.stabilizeRoomState('connected');
    this.rebuildVoiceParticipantsFromRoom();
  }

  handleDisconnected(): void {
    this.clearStabilizer();
    this.startDisconnectGrace();
  }

  handleParticipantConnected(_p: RemoteParticipant): void {
    this.rebuildVoiceParticipantsFromRoom();
  }

  handleParticipantDisconnected(_identity: string): void {
    this.rebuildVoiceParticipantsFromRoom();
  }

  handleTrackSubscribed(
    _track: RemoteAudioTrack | RemoteVideoTrack,
    _publication: { source?: string },
    _participant: LocalParticipant | RemoteParticipant,
    _room: Room
  ): void {
    this.rebuildVoiceParticipantsFromRoom();
  }

  handleTrackUnsubscribed(
    _track: RemoteAudioTrack | RemoteVideoTrack,
    _publication: { source?: string },
    _participant: LocalParticipant | RemoteParticipant
  ): void {
    this.rebuildVoiceParticipantsFromRoom();
  }

  handleTrackMuted(_participant: LocalParticipant | RemoteParticipant): void {
    this.rebuildVoiceParticipantsFromRoom();
  }

  handleTrackUnmuted(_participant: LocalParticipant | RemoteParticipant): void {
    this.rebuildVoiceParticipantsFromRoom();
  }

  handleActiveSpeakersChanged(speakers: { identity: string }[]): void {
    this.speaking = new Set(speakers.map((s) => s.identity));
    this.rebuildVoiceParticipantsFromRoom();
  }

  handleTrackPublished(_participant: LocalParticipant | RemoteParticipant): void {
    this.rebuildVoiceParticipantsFromRoom();
  }

  handleTrackUnpublished(_participant: LocalParticipant | RemoteParticipant): void {
    this.rebuildVoiceParticipantsFromRoom();
  }
}

