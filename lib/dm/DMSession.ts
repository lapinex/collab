/**
 * DMSession — single source of truth for DM channels and call state (like VoiceSession for voice).
 * Messages are NOT stored here; DM uses the same Entity Slice as server channels (useMessages + GET /api/messages).
 * Subscribes to RealtimeManager only for dm:call:{dmId} events.
 */

import { getRealtimeManager } from '@/lib/realtime/RealtimeManager';
import { apiGet, apiPost } from '@/lib/api-client';
import type { DMChannel } from '@/types/dm';

export type DMCallState = 'idle' | 'calling' | 'incoming' | 'in_call';

export interface DMIncomingCall {
  dmId: string;
  fromUser: { id: string; name: string; avatarUrl: string | null };
}

export interface DMSessionSnapshot {
  channels: DMChannel[];
  activeDmId: string | null;
  callState: DMCallState;
  incomingCall: DMIncomingCall | null;
  activeCallDmId: string | null;
  currentUserId: string | null;
}

/** useSyncExternalStore: listeners are () => void; React calls getSnapshot() after notify. */
type Listener = () => void;

const DM_ROOM_PREFIX = 'dm-';

export function getDMRoomName(dmId: string): string {
  return `${DM_ROOM_PREFIX}${dmId}`;
}

export function isDMRoom(roomName: string): boolean {
  return roomName.startsWith(DM_ROOM_PREFIX);
}

export function getDmIdFromRoomName(roomName: string): string | null {
  if (!roomName.startsWith(DM_ROOM_PREFIX)) return null;
  return roomName.slice(DM_ROOM_PREFIX.length);
}

class DMSessionImpl {
  private channels: DMChannel[] = [];
  private activeDmId: string | null = null;
  private callState: DMCallState = 'idle';
  private incomingCall: DMIncomingCall | null = null;
  private activeCallDmId: string | null = null;
  private currentUserId: string | null = null;
  private listeners = new Set<Listener>();

  /** Cached snapshot so useSyncExternalStore gets stable reference until next emit (fixes React #185). */
  private cachedSnapshot: DMSessionSnapshot | null = null;

  private unsubCall = new Map<string, () => void>();

  subscribe(callback: Listener): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private buildSnapshot(): DMSessionSnapshot {
    return {
      channels: [...this.channels],
      activeDmId: this.activeDmId,
      callState: this.callState,
      incomingCall: this.incomingCall,
      activeCallDmId: this.activeCallDmId,
      currentUserId: this.currentUserId,
    };
  }

  getSnapshot(): DMSessionSnapshot {
    if (this.cachedSnapshot !== null) {
      return this.cachedSnapshot;
    }
    this.cachedSnapshot = this.buildSnapshot();
    return this.cachedSnapshot;
  }

  private emit(): void {
    this.cachedSnapshot = this.buildSnapshot();
    this.listeners.forEach((l) => l());
  }

  setCurrentUserId(userId: string | null): void {
    if (this.currentUserId === userId) return;
    this.currentUserId = userId;
    this.emit();
  }

  setActiveDm(dmId: string | null): void {
    if (this.activeDmId === dmId) return;
    this.activeDmId = dmId;
    this.emit();
  }

  /** Load channel list from API and subscribe to call events for each DM. */
  async loadChannels(): Promise<void> {
    const response = await apiGet<{ channels: DMChannel[] }>('/api/dms/channels');
    const list = response.channels ?? [];
    this.channels = list;
    list.forEach((ch) => this.ensureCallSubscriptions(ch.id));
    this.emit();
  }

  /** If the given DM channel is not in the list, reload channels (e.g. after notification:new for a new DM). */
  async refreshChannelsIfNeeded(channelId: string): Promise<void> {
    if (this.channels.some((ch) => ch.id === channelId)) return;
    await this.loadChannels();
  }

  private ensureCallSubscriptions(dmId: string): void {
    const rt = getRealtimeManager();
    if (this.unsubCall.has(dmId)) return;
    const events = ['call_offer', 'call_accept', 'call_reject', 'call_end'] as const;
    const unsubs: (() => void)[] = [];
    const topic = `dm:call:${dmId}`;
    events.forEach((ev) => {
      unsubs.push(
        rt.subscribeToBroadcast(topic, ev, (payload) => {
          this.handleCallEvent(dmId, ev, payload);
        })
      );
    });
    this.unsubCall.set(dmId, () => unsubs.forEach((u) => u()));
  }

  private handleCallEvent(
    dmId: string,
    event: 'call_offer' | 'call_accept' | 'call_reject' | 'call_end',
    payload: unknown
  ): void {
    const p = payload as { fromUserId?: string; fromUser?: { id: string; name: string; avatarUrl: string | null } };
    if (event === 'call_offer') {
      if (this.currentUserId === p.fromUserId) return;
      this.incomingCall = {
        dmId,
        fromUser: p.fromUser ?? { id: p.fromUserId ?? '', name: 'User', avatarUrl: null },
      };
      this.callState = 'incoming';
    } else if (event === 'call_accept') {
      if (this.callState === 'calling' && this.activeCallDmId === dmId) {
        this.callState = 'in_call';
        this.activeCallDmId = dmId;
      }
    } else if (event === 'call_reject') {
      if (this.callState === 'calling' && this.activeCallDmId === dmId) {
        this.callState = 'idle';
        this.activeCallDmId = null;
      }
    } else if (event === 'call_end') {
      if (this.callState === 'incoming' && this.incomingCall?.dmId === dmId) {
        this.incomingCall = null;
        this.callState = 'idle';
      } else if (this.callState === 'in_call' && this.activeCallDmId === dmId) {
        this.activeCallDmId = null;
        this.callState = 'idle';
      }
    }
    this.emit();
  }

  /** Create or get DM channel by other user id. */
  async createOrGetChannel(otherUserId: string): Promise<DMChannel> {
    const response = await apiPost<{ channel: DMChannel }>('/api/dms/channels', {
      userId: otherUserId,
    });
    const ch = response.channel;
    if (!this.channels.some((c) => c.id === ch.id)) {
      this.channels = [ch, ...this.channels];
      this.ensureCallSubscriptions(ch.id);
      this.emit();
    }
    return ch;
  }

  /** Start DM call: broadcast offer, then connect to LiveKit. queryClient from useQueryClient() in hook. */
  async startCall(dmId: string, queryClient: import('@tanstack/react-query').QueryClient): Promise<void> {
    if (this.callState !== 'idle' || !this.currentUserId) return;
    const ch = this.channels.find((c) => c.id === dmId);
    if (!ch) return;
    this.callState = 'calling';
    this.activeCallDmId = dmId;
    this.emit();
    try {
      await apiPost('/api/dms/call/offer', {
        dmId,
        fromUserId: this.currentUserId,
        fromUser: {
          id: this.currentUserId,
          name: ch.otherUser.name,
          avatarUrl: ch.otherUser.avatarUrl,
        },
      });
      const tokenRes = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ roomType: 'dm', dmId }),
      });
      if (!tokenRes.ok) throw new Error('Failed to get LiveKit token for DM');
      const { token, url } = await tokenRes.json();
      const roomName = getDMRoomName(dmId);
      const { getVoiceRuntime } = await import('@/lib/voice-runtime/voiceRuntime');
      await getVoiceRuntime().roomController.connect(
        url,
        token,
        roomName,
        null,
        true,
        queryClient,
        `DM: ${ch.otherUser.name}`
      );
      this.callState = 'in_call';
      this.emit();
    } catch (e) {
      console.error('[DMSession] startCall failed', e);
      this.callState = 'idle';
      this.activeCallDmId = null;
      this.emit();
    }
  }

  /** Accept incoming call: connect to room, then broadcast call_accept. queryClient from useQueryClient(). */
  async acceptCall(queryClient: import('@tanstack/react-query').QueryClient): Promise<void> {
    const inc = this.incomingCall;
    if (!inc || this.callState !== 'incoming') return;
    const dmId = inc.dmId;
    try {
      const tokenRes = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ roomType: 'dm', dmId }),
      });
      if (!tokenRes.ok) throw new Error('Failed to get LiveKit token for DM');
      const { token, url } = await tokenRes.json();
      const roomName = getDMRoomName(dmId);
      const { getVoiceRuntime } = await import('@/lib/voice-runtime/voiceRuntime');
      await getVoiceRuntime().roomController.connect(
        url,
        token,
        roomName,
        null,
        true,
        queryClient,
        `DM: ${inc.fromUser.name}`
      );
      await apiPost('/api/dms/call/accept', { dmId, fromUserId: this.currentUserId });
      this.incomingCall = null;
      this.callState = 'in_call';
      this.activeCallDmId = dmId;
      this.emit();
    } catch (e) {
      console.error('[DMSession] acceptCall failed', e);
      this.incomingCall = null;
      this.callState = 'idle';
      this.emit();
    }
  }

  /** Reject incoming call. */
  async rejectCall(): Promise<void> {
    const inc = this.incomingCall;
    if (!inc) return;
    const dmId = inc.dmId;
    await apiPost('/api/dms/call/reject', { dmId, fromUserId: this.currentUserId }).catch(() => {});
    this.incomingCall = null;
    this.callState = 'idle';
    this.emit();
  }

  /** End current DM call (leave LiveKit and broadcast call_end). Only disconnects if current room is this DM. */
  async endCall(): Promise<void> {
    const dmId = this.activeCallDmId;
    if (!dmId) return;
    const { getVoiceRuntime } = await import('@/lib/voice-runtime/voiceRuntime');
    const roomName = getDMRoomName(dmId);
    if (getVoiceRuntime().roomController.getCurrentChannelId() === roomName) {
      await getVoiceRuntime().roomController.disconnect();
    }
    await apiPost('/api/dms/call/end', { dmId, fromUserId: this.currentUserId }).catch(() => {});
    this.activeCallDmId = null;
    this.callState = 'idle';
    this.emit();
  }
}

let instance: DMSessionImpl | null = null;

export function getDMSession(): DMSessionImpl {
  if (typeof window === 'undefined') {
    throw new Error('getDMSession is client-only');
  }
  if (!instance) {
    instance = new DMSessionImpl();
  }
  return instance;
}
