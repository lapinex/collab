/**
 * Voice runtime — singleton outside React. Owns audioLayer, voiceSession, roomController.
 * React never owns voice lifecycle; it only subscribes (useVoiceSession) and calls connect/leave.
 * On server (SSR), returns a stub so components that touch the runtime during render do not throw.
 */

import { VoiceAudioLayer } from './VoiceAudioLayer';
import { VoiceSessionImpl } from '@/lib/voice-session/VoiceSession';
import { VoiceRoomControllerImpl } from '@/lib/voice-view/roomController';
import type { VoiceSessionSnapshot } from '@/lib/voice-session/VoiceSession';

const SERVER_SNAPSHOT: VoiceSessionSnapshot = {
  channelId: null,
  state: 'idle',
  connectionState: 'disconnected',
  participants: {},
  order: [],
  speaking: [],
  channelName: null,
  meta: {
    canSpeak: true,
    micId: null,
    speakerId: null,
    isMuted: false,
    isDeafened: false,
    isScreenSharing: false,
    screenParticipantSid: null,
  },
};

/** Stub returned during SSR so hooks/components that call getVoiceRuntime() during render do not throw. */
function createServerStub(): VoiceRuntime {
  const noop = () => {};
  const noopAsync = async () => {};
  return {
    get audioLayer() {
      return null as unknown as VoiceAudioLayer;
    },
    voiceSession: {
      getSnapshot: () => SERVER_SNAPSHOT,
      subscribe: () => noop,
      setMeta: noop,
    } as unknown as VoiceSessionImpl,
    roomController: {
      getRoom: () => null,
      getCurrentChannelId: () => null,
      connect: noopAsync,
      disconnect: noopAsync,
      switchMic: noopAsync,
      sendModeratorCommand: noop,
      getScreenTrack: () => null,
      getScreenOwner: () => null,
    } as unknown as VoiceRoomControllerImpl,
  } as VoiceRuntime;
}

let serverStub: VoiceRuntime | null = null;

export class VoiceRuntime {
  readonly audioLayer: VoiceAudioLayer;
  readonly voiceSession: VoiceSessionImpl;
  readonly roomController: VoiceRoomControllerImpl;

  constructor() {
    this.audioLayer = new VoiceAudioLayer();
    this.voiceSession = new VoiceSessionImpl(this.audioLayer);
    this.roomController = new VoiceRoomControllerImpl(this.voiceSession);
  }

  init(): void {
    this.audioLayer.mount();
  }
}

declare global {
  interface Window {
    __voiceRuntime?: VoiceRuntime;
  }
}

export function getVoiceRuntime(): VoiceRuntime {
  if (typeof window === 'undefined') {
    if (!serverStub) serverStub = createServerStub();
    return serverStub;
  }
  if (!window.__voiceRuntime) {
    window.__voiceRuntime = new VoiceRuntime();
    window.__voiceRuntime.init();
  }
  return window.__voiceRuntime;
}
