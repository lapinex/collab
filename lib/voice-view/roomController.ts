/**
 * Thin adapter: owns LiveKit Room and forwards all events to VoiceSession.
 * Does NOT own room state, participants, or audio attach/detach — VoiceSession does.
 * Only: Room lifecycle, initLocalAudio, vv:meta (local mic/mute), and syncing VoiceSession → vv:*.
 *
 * Singleton Room lifecycle (Discord/Meet style):
 * - One Room instance per voice session. new Room() only when first connecting (room === null).
 * - Reconnect is REACTIVE only: called from RoomEvent.Disconnected (SDK/server dropped us).
 *   NEVER call room.disconnect() from watchdog, ICE/RTP/stats or timers — that causes CLIENT_INITIATED leaves.
 * - Watchdog only logs and warns; it must NOT touch the connection.
 * - room.disconnect() is allowed ONLY in disconnect() (user leaves voice). Nowhere else.
 */

import type { QueryClient } from '@tanstack/react-query';
import {
  Room,
  RoomEvent,
  ConnectionState as LKConnectionState,
  RemoteParticipant,
  LocalParticipant,
  Track,
  LocalAudioTrack,
  LocalVideoTrack,
  RemoteAudioTrack,
  RemoteVideoTrack,
} from 'livekit-client';
import {
  vvRoomKey,
  vvMetaKey,
  vvChannelNameKey,
  vvActiveChannelKey,
  type VoiceMetaSlice,
} from './keys';
import { patchRoomState, patchMeta } from './patchers';
import type { VoiceConnectionState } from './keys';
import { markRealConnect } from './networkWarmup';
import type { VoiceSessionImpl } from '@/lib/voice-session/VoiceSession';
import { applyVoiceSessionSnapshot } from '@/lib/voice-session/syncVoiceSessionToQuery';

/** Watchdog: check ICE/media every 2s. Logging/diagnostics only — never touches connection. */
const WATCHDOG_INTERVAL_MS = 2000;
/** ICE "disconnected" longer than this → log warning only (no reconnect from watchdog). */
const ICE_DISCONNECTED_MAX_MS = 4000;
/** No audio activity longer than this while connected → log warning only. */
const AUDIO_SILENCE_MAX_MS = 6000;
/** Do not attempt reconnect more than once within this window (reactive reconnect only). */
const RECONNECT_COOLDOWN_MS = 10000;
const UNMUTED_GAIN = 0.82;

let rnnoiseWasmCache: ArrayBuffer | null = null;

function mapLKStateToSlice(state: LKConnectionState): VoiceConnectionState {
  if (state === LKConnectionState.SignalReconnecting) return 'reconnecting';
  return state as VoiceConnectionState;
}

function clearChannelMeta(queryClient: QueryClient, channelId: string): void {
  queryClient.setQueryData(
    vvMetaKey(channelId),
    patchMeta(undefined, {
      canSpeak: true,
      micId: null,
      speakerId: null,
      isMuted: false,
      isDeafened: false,
      isScreenSharing: false,
      screenParticipantSid: null,
    })
  );
  queryClient.setQueryData(vvChannelNameKey(channelId), null);
}

/** LiveKit engine exposes pcManager with publisher/subscriber (PCTransport). Used for ICE watchdog. */
interface RoomEngineLike {
  engine?: {
    pcManager?: {
      publisher?: { getICEConnectionState(): RTCIceConnectionState };
      subscriber?: { getICEConnectionState(): RTCIceConnectionState };
    };
  };
}

export class VoiceRoomControllerImpl {
  /**
   * Singleton Room instance. Created once on first connect(), never replaced until disconnect().
   * Reactive reconnect (after RoomEvent.Disconnected): room.connect() only, no disconnect().
   */
  private room: Room | null = null;
  private readonly voiceSession: VoiceSessionImpl;
  private currentChannelId: string | null = null;
  private queryClient: QueryClient | null = null;
  private localAudioTrack: LocalAudioTrack | null = null;
  /** Reuse same MediaStream across reconnects to avoid RTP renegotiation. Cleared only on disconnect(). */
  private cachedMicStream: MediaStream | null = null;
  private cachedMicDeviceId: string | null = null;

  /** Screen share: source of truth ONLY. Updated ONLY by TrackPublished/TrackUnpublished (ScreenShare) and ParticipantDisconnected. */
  private activeScreenParticipantSid: string | null = null;
  /** Cached remote screen track for rendering; set in TrackSubscribed (ScreenShare), cleared in TrackUnsubscribed/ParticipantDisconnected. */
  private screenTrack: RemoteVideoTrack | null = null;

  private unsubscribeVoiceSession: (() => void) | null = null;

  /** Saved for reconnect (same url/token on same Room instance). */
  private lastConnectUrl: string | null = null;
  private lastConnectToken: string | null = null;

  /** ICE watchdog: how long ICE has been "disconnected". */
  private iceDisconnectedSince: number | null = null;
  /** Audio activity: last time we saw track activity (TrackSubscribed audio / TrackUnmuted). */
  private lastAudioActivityAt = 0;
  /** Watchdog timer. */
  private watchdogIntervalId: ReturnType<typeof setInterval> | null = null;
  /** Safety: do not attempt reactive reconnect more than once per COOLDOWN. */
  private lastReconnectAt = 0;
  /** True only when disconnect() is calling room.disconnect() (user leave). Disconnected handler skips reconnect. */
  private isUserDisconnect = false;
  /** Restore mute state after reconnect; saved before Disconnected. */
  private wasMutedBeforeReconnect = true;
  /** Logical mute (GainNode); track stays enabled so RTP never stops. */
  private logicalMuted = true;

  /** Silent RTP: pipeline so mute = gain 0, not track.enabled = false. RNNoise (AudioWorklet) before GainNode. */
  private audioContext: AudioContext | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private rnnoiseNode: AudioWorkletNode | null = null;
  private gainNode: GainNode | null = null;
  private processedDestination: MediaStreamAudioDestinationNode | null = null;

  /** Runtime-safe: heartbeat and lifecycle guards (installed once). */
  private runtimeHeartbeatId: ReturnType<typeof setInterval> | null = null;
  private keepAliveOscillator: OscillatorNode | null = null;
  private runtimeGuardsInstalled = false;

  constructor(voiceSession: VoiceSessionImpl) {
    this.voiceSession = voiceSession;
  }

  private setMeta(updates: Partial<VoiceMetaSlice>) {
    this.voiceSession.setMeta(updates);
  }

  /** Mute via GainNode (RTP keeps flowing with silent frames). Never use track.mute()/unmute(). */
  private setMutedState(muted: boolean): void {
    this.logicalMuted = muted;
    if (this.gainNode) {
      this.gainNode.gain.value = muted ? 0 : UNMUTED_GAIN;
    }
    this.setMeta({ isMuted: muted, micId: this.cachedMicDeviceId });
  }

  /** Public for UI toggleMute/toggleDeafen. */
  setMuted(muted: boolean): void {
    this.setMutedState(muted);
  }

  /** Disconnect nodes only; do not close AudioContext on reconnect so RTP stays alive. */
  private closeMicPipeline(): void {
    this.micSourceNode?.disconnect();
    this.micSourceNode = null;
    this.rnnoiseNode?.disconnect();
    this.rnnoiseNode = null;
    this.gainNode = null;
    this.processedDestination?.disconnect();
    this.processedDestination = null;
  }

  /** Load RNNoise WASM in main thread (AudioWorklet has no fetch). Cached for reuse. */
  private async getRnnoiseWasmBytes(): Promise<ArrayBuffer | null> {
    if (rnnoiseWasmCache) return rnnoiseWasmCache;
    try {
      const res = await fetch('/rnnoise.wasm');
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      rnnoiseWasmCache = buf;
      return buf;
    } catch {
      return null;
    }
  }

  /** Mark audio activity for watchdog (TrackSubscribed audio / TrackUnmuted). */
  private markAudioActivity(): void {
    this.lastAudioActivityAt = Date.now();
  }

  /** Page visibility / lifecycle: resume AudioContext when tab becomes active. */
  private installRuntimeGuards(): void {
    if (this.runtimeGuardsInstalled) return;
    this.runtimeGuardsInstalled = true;

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.audioContext?.resume();
      }
    });
    window.addEventListener('focus', () => {
      this.audioContext?.resume();
    });
    window.addEventListener('resume', () => {
      this.audioContext?.resume();
    });
    document.addEventListener('freeze', () => {
      console.warn('[Voice] Page freeze detected');
    });
    document.addEventListener('resume', () => {
      console.warn('[Voice] Page resume detected');
      this.audioContext?.resume();
    });

    if (typeof PerformanceObserver !== 'undefined') {
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration > 200) {
              console.warn('[Voice] Long task detected (ms):', Math.round(entry.duration));
            }
          }
        }).observe({ entryTypes: ['longtask'] });
      } catch {
        // longtask not supported
      }
    }
  }

  private startRuntimeHeartbeat(): void {
    this.stopRuntimeHeartbeat();
    this.runtimeHeartbeatId = setInterval(() => {
      if (this.audioContext?.state === 'suspended') {
        this.audioContext.resume();
      }
    }, 1000);
  }

  private stopRuntimeHeartbeat(): void {
    if (this.runtimeHeartbeatId != null) {
      clearInterval(this.runtimeHeartbeatId);
      this.runtimeHeartbeatId = null;
    }
  }

  private startKeepAliveTone(): void {
    this.stopKeepAliveTone();
    if (!this.audioContext) return;
    try {
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      gain.gain.value = 0.00001;
      osc.connect(gain).connect(this.audioContext.destination);
      osc.start();
      this.keepAliveOscillator = osc;
    } catch (_) {
      // ignore
    }
  }

  private stopKeepAliveTone(): void {
    try {
      this.keepAliveOscillator?.stop();
    } catch (_) {}
    this.keepAliveOscillator = null;
  }

  private startWatchdog(): void {
    this.stopWatchdog();
    this.iceDisconnectedSince = null;
    this.lastAudioActivityAt = Date.now();
    this.watchdogIntervalId = setInterval(() => this.runWatchdogCheck(), WATCHDOG_INTERVAL_MS);
  }

  private stopWatchdog(): void {
    if (this.watchdogIntervalId != null) {
      clearInterval(this.watchdogIntervalId);
      this.watchdogIntervalId = null;
    }
    this.iceDisconnectedSince = null;
  }

  /**
   * Watchdog: diagnostics only. Reads ICE state and audio activity, logs warnings.
   * MUST NOT call reconnectRoom(), room.disconnect(), or any logic that touches the connection.
   * LiveKit/WebRTC recover on their own; client-initiated disconnect causes CLIENT_INITIATED leaves.
   */
  private runWatchdogCheck(): void {
    const room = this.room;
    if (!room || room.state !== 'connected') return;

    const engine = (room as unknown as RoomEngineLike).engine;
    const pcManager = engine?.pcManager;
    const now = Date.now();

    if (pcManager) {
      const pubState = pcManager.publisher?.getICEConnectionState?.() ?? 'closed';
      const subState = pcManager.subscriber?.getICEConnectionState?.() ?? 'closed';

      if (pubState !== 'connected' && pubState !== 'completed' && pubState !== 'closed') {
        console.warn('[VoiceRoomController] ICE watchdog: publisher state', pubState);
      }
      if (subState !== 'connected' && subState !== 'completed' && subState !== 'closed') {
        console.warn('[VoiceRoomController] ICE watchdog: subscriber state', subState);
      }

      if (pubState === 'failed' || subState === 'failed') {
        console.warn('[VoiceRoomController] ICE watchdog: ICE failed (log only; no client disconnect)');
        return;
      }

      if (pubState === 'disconnected' || subState === 'disconnected') {
        if (this.iceDisconnectedSince == null) {
          this.iceDisconnectedSince = now;
          console.warn('[VoiceRoomController] ICE watchdog: ICE disconnected (log only)');
        } else if (now - this.iceDisconnectedSince > ICE_DISCONNECTED_MAX_MS) {
          console.warn(
            '[VoiceRoomController] ICE watchdog: ICE disconnected >',
            ICE_DISCONNECTED_MAX_MS,
            'ms (log only; no client disconnect)'
          );
        }
      } else {
        this.iceDisconnectedSince = null;
      }
    }

    const hasRemoteParticipants = room.remoteParticipants.size > 0;
    const silenceMs = now - this.lastAudioActivityAt;
    if (hasRemoteParticipants && silenceMs > AUDIO_SILENCE_MAX_MS) {
      const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      if (pub?.track) {
        void (pub.track as LocalAudioTrack)
          .getRTCStatsReport?.()
          ?.then((stats) => console.warn('[Voice] Audio sender stats (diagnostics):', stats))
          .catch(() => {});
      }
      console.warn(
        '[VoiceRoomController] ICE watchdog: no audio activity for',
        Math.round(silenceMs / 1000),
        's, remote participants:',
        room.remoteParticipants.size,
        '(log only; no client disconnect)'
      );
    }
  }

  // CRITICAL:
  // reconnect allowed ONLY after RoomEvent.Disconnected (SDK/server dropped us).
  // NEVER call disconnect based on stats, ICE, RTP or timers.
  // Doing so causes CLIENT_INITIATED leaves and micro-disconnects.

  /**
   * Reactive reconnect: call ONLY from room.on(RoomEvent.Disconnected).
   * Room is already in Disconnected state; we only call room.connect().
   * MUST NOT call room.disconnect() here.
   */
  private async reconnectRoom(reason: string): Promise<void> {
    const now = Date.now();
    if (now - this.lastReconnectAt < RECONNECT_COOLDOWN_MS) {
      console.warn(
        '[VoiceRoomController] reconnectRoom skipped (cooldown):',
        reason,
        'last at',
        new Date(this.lastReconnectAt).toISOString()
      );
      return;
    }

    const room = this.room;
    const url = this.lastConnectUrl;
    const token = this.lastConnectToken;
    const channelId = this.currentChannelId;
    const queryClient = this.queryClient;
    if (!room || !url || !token || !channelId || !queryClient) {
      console.warn('[VoiceRoomController] reconnectRoom skipped (missing room/url/token/channel):', reason);
      return;
    }
    if (room.state !== 'disconnected') {
      console.warn('[VoiceRoomController] reconnectRoom skipped (room not disconnected):', reason);
      return;
    }

    console.warn('[VoiceRoomController] reconnectRoom (reactive, connect only):', reason);
    this.lastReconnectAt = now;

    try {
      await room.connect(url, token, {
        rtcConfig: { iceTransportPolicy: 'relay' },
      });
      /* RoomEvent.Connected will run: handleConnected, initLocalAudio, startWatchdog */
    } catch (e) {
      console.error('[VoiceRoomController] reconnectRoom: connect failed', e);
      if (channelId && queryClient) {
        queryClient.setQueryData(vvRoomKey(channelId), patchRoomState(undefined, 'disconnected'));
        clearChannelMeta(queryClient, channelId);
        queryClient.setQueryData(vvActiveChannelKey(), null);
      }
      this.currentChannelId = null;
      this.queryClient = null;
      this.voiceSession.handleDisconnected();
    }
  }

  /**
   * Publish mic track immediately on connect (AFK/no-media fix). Silent RTP: mute = GainNode 0, track stays enabled
   * so LiveKit never sees 0 bitrate and does not trigger RTCP timeout. Reuse cachedMicStream across reconnects.
   */
  private async initLocalAudio(): Promise<void> {
    const room = this.room;
    if (!this.queryClient || !room || room.state !== 'connected') return;

    const savedMicId =
      this.voiceSession.getSnapshot().meta?.micId ??
      (typeof localStorage !== 'undefined'
        ? (localStorage.getItem('preferredMicId') || localStorage.getItem('livekit_selected_mic'))
        : null);

    try {
      this.closeMicPipeline();

      let stream: MediaStream;
      const hasValidCache =
        this.cachedMicStream &&
        this.cachedMicStream.getAudioTracks().length > 0 &&
        this.cachedMicStream.getAudioTracks()[0]!.readyState === 'live';

      if (hasValidCache) {
        stream = this.cachedMicStream!;
      } else {
        if (this.cachedMicStream) {
          this.cachedMicStream.getTracks().forEach((t) => t.stop());
          this.cachedMicStream = null;
          this.cachedMicDeviceId = null;
        }
        stream = await navigator.mediaDevices.getUserMedia({
          audio: savedMicId
            ? { deviceId: savedMicId, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
            : { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        this.cachedMicStream = stream;
        this.cachedMicDeviceId = savedMicId;
      }

      const rawTrack = stream.getAudioTracks()[0];
      if (!rawTrack) {
        throw new Error('No audio track in stream');
      }

      if (this.audioContext?.state === 'closed') {
        this.audioContext = null;
      }
      if (!this.audioContext) {
        this.audioContext = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
        this.audioContext.onstatechange = () => {
          if (this.audioContext?.state === 'suspended') {
            this.audioContext.resume();
          }
        };
      }
      this.micSourceNode = this.audioContext.createMediaStreamSource(new MediaStream([rawTrack]));
      this.gainNode = this.audioContext.createGain();
      this.processedDestination = this.audioContext.createMediaStreamDestination();
      // Force mono so RNNoise (mono processor) does not produce silent right channel
      this.processedDestination.channelCount = 1;

      try {
        const wasmBytes = await this.getRnnoiseWasmBytes();
        await this.audioContext.audioWorklet.addModule('/audio-worklets/rnnoise-processor.js');
        this.rnnoiseNode = new AudioWorkletNode(this.audioContext, 'rnnoise-processor', {
          processorOptions: wasmBytes ? { wasmBytes } : undefined,
        });
        this.micSourceNode.connect(this.rnnoiseNode);
        this.rnnoiseNode.connect(this.gainNode);
        console.info('[VoiceRoomController] rnnoise_active');
      } catch {
        this.micSourceNode.connect(this.gainNode);
        console.warn('[VoiceRoomController] rnnoise_passthrough');
      }
      this.gainNode.connect(this.processedDestination);

      const processedTrack = this.processedDestination.stream.getAudioTracks()[0];
      if (!processedTrack) {
        throw new Error('No processed audio track');
      }

      const audioTrack = new LocalAudioTrack(processedTrack, undefined, true);
      this.localAudioTrack = audioTrack;
      await room.localParticipant.publishTrack(audioTrack, { source: Track.Source.Microphone });
      this.setMutedState(this.wasMutedBeforeReconnect);
    } catch (err) {
      console.error('[VoiceRoomController] Failed to create/publish local audio track:', err);
      this.setMeta({ isMuted: true });
    }
  }

  /** Bind RoomEvent handlers once per Room instance. Never remove or re-bind during session. */
  private bindRoomEvents(room: Room): void {
    room.on(RoomEvent.ConnectionStateChanged, (state: LKConnectionState) => {
      this.voiceSession.handleConnectionStateChanged(mapLKStateToSlice(state));
    });
    room.on(RoomEvent.Reconnecting, () => {
      this.voiceSession.handleReconnecting();
    });
    room.on(RoomEvent.Reconnected, () => {
      this.voiceSession.handleReconnected();
    });

    room.on(RoomEvent.Connected, () => {
      this.voiceSession.handleConnected(room);
      const savedMicId =
        typeof localStorage !== 'undefined'
          ? (localStorage.getItem('preferredMicId') || localStorage.getItem('livekit_selected_mic'))
          : null;
      this.setMeta({ micId: savedMicId, isMuted: true });
      void this.initLocalAudio();
      this.startWatchdog();
      this.startRuntimeHeartbeat();
      this.startKeepAliveTone();
    });

    // Transport cleanup ONLY here (and in disconnect()). Never from VoiceSession snapshot.
    // Reconnect is REACTIVE only: when SDK/server dropped us (!isUserDisconnect), we call reconnectRoom.
    room.on(RoomEvent.Disconnected, () => {
      this.wasMutedBeforeReconnect = this.logicalMuted;
      this.stopWatchdog();
      this.stopRuntimeHeartbeat();
      this.stopKeepAliveTone();
      if (this.isUserDisconnect) {
        this.isUserDisconnect = false;
        this.localAudioTrack = null;
        this.activeScreenParticipantSid = null;
        this.screenTrack = null;
        const channelId = this.currentChannelId;
        const queryClient = this.queryClient;
        this.unsubscribeVoiceSession?.();
        this.unsubscribeVoiceSession = null;
        if (channelId && queryClient) {
          queryClient.setQueryData(vvRoomKey(channelId), patchRoomState(undefined, 'disconnected'));
          clearChannelMeta(queryClient, channelId);
          queryClient.setQueryData(vvActiveChannelKey(), null);
        }
        this.currentChannelId = null;
        this.queryClient = null;
        return;
      }
      this.localAudioTrack = null;
      this.activeScreenParticipantSid = null;
      this.screenTrack = null;
      void this.reconnectRoom('sdk_disconnected');
    });

    room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      this.voiceSession.handleParticipantConnected(participant);
    });

    room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      if (participant.sid === this.activeScreenParticipantSid) {
        this.activeScreenParticipantSid = null;
        this.screenTrack = null;
        this.setMeta({ screenParticipantSid: null });
      }
      this.voiceSession.handleParticipantDisconnected(participant.identity);
    });

    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind === Track.Kind.Audio) {
        this.markAudioActivity();
      }
      if (
        track.kind === Track.Kind.Video &&
        track instanceof RemoteVideoTrack &&
        publication.source === Track.Source.ScreenShare
      ) {
        this.screenTrack = track;
      }
      this.voiceSession.handleTrackSubscribed(
        track as RemoteAudioTrack | RemoteVideoTrack,
        { source: publication.source },
        participant,
        room
      );
    });

    room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      if (publication.source === Track.Source.ScreenShare && participant.sid === this.activeScreenParticipantSid) {
        this.screenTrack = null;
      }
      this.voiceSession.handleTrackUnsubscribed(
        track as RemoteAudioTrack | RemoteVideoTrack,
        { source: publication.source },
        participant
      );
    });

    room.on(RoomEvent.TrackMuted, (publication, participant) => {
      if (publication.source === Track.Source.Microphone && participant === room.localParticipant) {
        this.setMutedState(true);
      }
      this.voiceSession.handleTrackMuted(participant as LocalParticipant | RemoteParticipant);
    });

    room.on(RoomEvent.TrackUnmuted, (publication, participant) => {
      if (publication.source === Track.Source.Microphone) {
        this.markAudioActivity();
        if (participant === room.localParticipant) {
          this.setMutedState(false);
        }
      }
      this.voiceSession.handleTrackUnmuted(participant as LocalParticipant | RemoteParticipant);
    });

    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      this.voiceSession.handleActiveSpeakersChanged(speakers);
    });

    room.on(RoomEvent.TrackPublished, (publication, participant) => {
      if (publication.source === Track.Source.ScreenShare) {
        this.activeScreenParticipantSid = participant.sid;
        this.setMeta({ screenParticipantSid: participant.sid });
        if (participant.identity === room.localParticipant.identity) {
          this.setMeta({ isScreenSharing: true });
        }
      }
      this.voiceSession.handleTrackPublished(participant);
    });

    room.on(RoomEvent.TrackUnpublished, (publication, participant) => {
      if (publication.source === Track.Source.ScreenShare) {
        if (participant.sid === this.activeScreenParticipantSid) {
          this.activeScreenParticipantSid = null;
          this.screenTrack = null;
        }
        this.setMeta({ screenParticipantSid: this.activeScreenParticipantSid });
        if (participant.identity === room.localParticipant.identity) {
          this.setMeta({ isScreenSharing: false });
        }
      }
      this.voiceSession.handleTrackUnpublished(participant);
    });

    room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
      try {
        const text = new TextDecoder().decode(payload);
        const msg = JSON.parse(text) as { type?: string; targetUserId?: string };
        if (msg.type !== 'voice:mute-member' && msg.type !== 'voice:deafen-member') return;
        if (!msg.targetUserId) return;
        const meta = room.localParticipant.metadata;
        let myUserId: string | null = null;
        if (meta) {
          try {
            const parsed = JSON.parse(meta) as { userId?: string };
            myUserId = parsed.userId ?? null;
          } catch {
            /* ignore */
          }
        }
        if (myUserId !== msg.targetUserId) return;
        if (msg.type === 'voice:mute-member') {
          this.setMutedState(true);
        } else if (msg.type === 'voice:deafen-member') {
          this.setMutedState(true);
          this.setMeta({ isDeafened: true });
        }
      } catch {
        /* ignore malformed payload */
      }
    });
  }

  /** Send moderator command to room (voice:mute-member | voice:deafen-member). Target client applies to self. */
  sendModeratorCommand(type: 'voice:mute-member' | 'voice:deafen-member', targetUserId: string): void {
    const room = this.room;
    if (!room || room.state !== 'connected') return;
    const payload = new TextEncoder().encode(JSON.stringify({ type, targetUserId }));
    room.localParticipant.publishData(payload, { reliable: false }).catch((err) => {
      console.error('[VoiceRoomController] publishData failed:', err);
    });
  }

  /**
   * Only sync UI (queryClient) from VoiceSession. Never make transport decisions from snapshot.
   * Transport state (currentChannelId, queryClient, tracks) is cleared only in RoomEvent.Disconnected
   * and in disconnect(). VoiceSession must NOT control roomController.
   */
  private onVoiceSessionSnapshot(snapshot: import('@/lib/voice-session/VoiceSession').VoiceSessionSnapshot) {
    if (!this.queryClient) return;
    applyVoiceSessionSnapshot(this.queryClient, snapshot);
  }

  async connect(
    url: string,
    token: string,
    channelId: string,
    _serverId: string | null,
    canSpeak: boolean,
    queryClient: QueryClient,
    channelName?: string | null
  ): Promise<void> {
    markRealConnect();

    if (this.currentChannelId === channelId && this.room?.state !== 'disconnected') {
      return;
    }
    if (this.room && this.room.state !== 'disconnected') {
      await this.disconnect();
    }

    if (this.room) {
      console.warn('[VoiceRoomController] Attempt to create second Room prevented (singleton)');
      return;
    }

    this.currentChannelId = channelId;
    this.queryClient = queryClient;
    this.lastConnectUrl = url;
    this.lastConnectToken = token;

    this.unsubscribeVoiceSession = this.voiceSession.subscribe((snapshot) =>
      this.onVoiceSessionSnapshot(snapshot)
    );
    this.voiceSession.startConnect(channelId, { channelName });
    this.voiceSession.setMeta({ canSpeak });
    this.installRuntimeGuards();

    this.room = new Room({ adaptiveStream: false, dynacast: false });
    this.bindRoomEvents(this.room);

    await this.room.connect(url, token, {
      rtcConfig: { iceTransportPolicy: 'relay' },
    });
  }

  /**
   * Full voice leave. This is the ONLY place in the project allowed to call room.disconnect().
   * reconnectRoom and watchdog must NEVER call room.disconnect() — that causes CLIENT_INITIATED leaves.
   */
  async disconnect(): Promise<void> {
    const room = this.room;
    if (!room) return;

    this.isUserDisconnect = true;
    this.stopWatchdog();
    this.stopRuntimeHeartbeat();
    this.stopKeepAliveTone();
    const channelId = this.currentChannelId;
    const queryClient = this.queryClient;

    this.unsubscribeVoiceSession?.();
    this.unsubscribeVoiceSession = null;

    this.voiceSession.disconnect(true);

    if (channelId && queryClient) {
      queryClient.setQueryData(vvRoomKey(channelId), patchRoomState(undefined, 'disconnected'));
      clearChannelMeta(queryClient, channelId);
      queryClient.setQueryData(vvActiveChannelKey(), null);
    }

    if (this.localAudioTrack) {
      try {
        await room.localParticipant.unpublishTrack(this.localAudioTrack);
        this.localAudioTrack.stop();
      } catch (_) {}
      this.localAudioTrack = null;
    }
    this.closeMicPipeline();
    this.audioContext?.close();
    this.audioContext = null;
    if (this.cachedMicStream) {
      this.cachedMicStream.getTracks().forEach((t) => t.stop());
      this.cachedMicStream = null;
      this.cachedMicDeviceId = null;
    }
    await room.disconnect();

    this.room = null;
    this.currentChannelId = null;
    this.queryClient = null;
    this.lastConnectUrl = null;
    this.lastConnectToken = null;
    this.activeScreenParticipantSid = null;
    this.screenTrack = null;
  }

  /**
   * Switch microphone device. Stops old pipeline and stream, acquires new one, builds pipeline, publishes processed track.
   */
  async switchMic(deviceId: string): Promise<void> {
    const room = this.room;
    if (!room || room.state !== 'connected') return;

    const wasMuted = this.logicalMuted;

    if (this.localAudioTrack) {
      try {
        await room.localParticipant.unpublishTrack(this.localAudioTrack);
        this.localAudioTrack.stop();
      } catch (_) {}
      this.localAudioTrack = null;
    }
    this.closeMicPipeline();
    if (this.cachedMicStream) {
      this.cachedMicStream.getTracks().forEach((t) => t.stop());
      this.cachedMicStream = null;
      this.cachedMicDeviceId = null;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    this.cachedMicStream = stream;
    this.cachedMicDeviceId = deviceId;

    const rawTrack = stream.getAudioTracks()[0];
    if (!rawTrack) {
      this.setMeta({ isMuted: true });
      return;
    }

    this.audioContext = new AudioContext({ sampleRate: 48000 });
    this.micSourceNode = this.audioContext.createMediaStreamSource(new MediaStream([rawTrack]));
    this.gainNode = this.audioContext.createGain();
    this.processedDestination = this.audioContext.createMediaStreamDestination();
    // Force mono so RNNoise (mono processor) does not produce silent right channel
    this.processedDestination.channelCount = 1;
    try {
      const wasmBytes = await this.getRnnoiseWasmBytes();
      await this.audioContext.audioWorklet.addModule('/audio-worklets/rnnoise-processor.js');
      this.rnnoiseNode = new AudioWorkletNode(this.audioContext, 'rnnoise-processor', {
        processorOptions: wasmBytes ? { wasmBytes } : undefined,
      });
      this.micSourceNode.connect(this.rnnoiseNode);
      this.rnnoiseNode.connect(this.gainNode);
      console.info('[VoiceRoomController] rnnoise_active');
    } catch {
      this.micSourceNode.connect(this.gainNode);
      console.warn('[VoiceRoomController] rnnoise_passthrough');
    }
    this.gainNode.connect(this.processedDestination);

    const processedTrack = this.processedDestination.stream.getAudioTracks()[0];
    if (!processedTrack) {
      this.setMeta({ isMuted: true });
      return;
    }

    const audioTrack = new LocalAudioTrack(processedTrack, undefined, true);
    this.localAudioTrack = audioTrack;
    await room.localParticipant.publishTrack(audioTrack, { source: Track.Source.Microphone });
    this.setMutedState(wasMuted);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('preferredMicId', deviceId);
    }
  }

  getRoom(): Room | null {
    return this.room;
  }

  getCurrentChannelId(): string | null {
    return this.currentChannelId;
  }

  getLocalAudioTrack(): LocalAudioTrack | null {
    return this.localAudioTrack;
  }

  /** Screen share: source of truth is activeScreenParticipantSid (Room events only). */
  getIsScreenSharing(): boolean {
    const room = this.room;
    if (!room || !this.activeScreenParticipantSid) return false;
    return room.localParticipant.sid === this.activeScreenParticipantSid;
  }

  /** Screen track for display: remote from TrackSubscribed, or local when we are the sharer. */
  getScreenTrack(): RemoteVideoTrack | LocalVideoTrack | null {
    const room = this.room;
    if (!room || !this.activeScreenParticipantSid) return null;
    if (room.localParticipant.sid === this.activeScreenParticipantSid) {
      const pub = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
      return (pub?.track as LocalVideoTrack) ?? null;
    }
    return this.screenTrack;
  }

  /** Resolve owner from room + activeScreenParticipantSid (no separate cache). */
  getScreenOwner(): RemoteParticipant | LocalParticipant | null {
    const room = this.room;
    if (!room || !this.activeScreenParticipantSid) return null;
    if (room.localParticipant.sid === this.activeScreenParticipantSid) {
      return room.localParticipant;
    }
    const remote = Array.from(room.remoteParticipants.values()).find(
      (p) => p.sid === this.activeScreenParticipantSid
    );
    return remote ?? null;
  }

  /**
   * Start screen share: getDisplayMedia + publishTrack only. No manual state.
   * Guard: if already sharing (activeScreenParticipantSid === local.sid), do nothing.
   */
  async startScreenShare(): Promise<void> {
    const room = this.room;
    if (!room || room.state !== 'connected') return;
    if (this.activeScreenParticipantSid === room.localParticipant.sid) {
      return;
    }
    try {
      const tracks = await room.localParticipant.createScreenTracks({ audio: true });
      const videoTrack = tracks.find((t): t is LocalVideoTrack => t.source === Track.Source.ScreenShare);
      const audioTrack = tracks.find((t) => t.source === Track.Source.ScreenShareAudio);
      if (videoTrack) {
        await room.localParticipant.publishTrack(videoTrack, { source: Track.Source.ScreenShare });
      }
      if (audioTrack) {
        await room.localParticipant.publishTrack(audioTrack, { source: Track.Source.ScreenShareAudio });
      }
    } catch (err) {
      console.error('[VoiceRoomController] startScreenShare failed', err);
    }
  }

  /**
   * Stop screen share: unpublishTrack + track.stop() only. UI updates from TrackUnpublished.
   */
  async stopScreenShare(): Promise<void> {
    const room = this.room;
    if (!room || room.state !== 'connected') return;
    const screenPub = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
    const screenAudioPub = room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
    if (screenPub?.track) {
      try {
        await room.localParticipant.unpublishTrack(screenPub.track);
        screenPub.track.stop();
      } catch (_) {}
    }
    if (screenAudioPub?.track) {
      try {
        await room.localParticipant.unpublishTrack(screenAudioPub.track);
        screenAudioPub.track.stop();
      } catch (_) {}
    }
  }
}
