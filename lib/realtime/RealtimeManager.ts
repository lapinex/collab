import { clientEnv } from '@/lib/env/clientEnv';
import { getAccessToken } from '@/lib/auth/access-token';
import { inferScope, getRoutingId, parseExplicitScope } from '@/lib/realtime/event-registry';

type BroadcastCallback = (payload: unknown) => void;

const TOPIC_EVENTS: Array<{ prefix: string; events: string[] }> = [
  {
    prefix: 'chat:',
    events: ['message', 'message:updated', 'message:deleted', 'message_reaction_added', 'message_reaction_removed'],
  },
  {
    prefix: 'channel:',
    events: ['message', 'message:updated', 'message:deleted', 'message_reaction_added', 'message_reaction_removed', 'participant_moderated', 'activity'],
  },
  { prefix: 'presence', events: ['presence:update', 'USER_PRESENCE_UPDATE'] },
  { prefix: 'dm:call:', events: ['call_offer', 'call_accept', 'call_reject', 'call_end'] },
  { prefix: 'voice:', events: ['participant_moderated'] },
  { prefix: 'user:', events: ['notification:new', 'server:member_joined', 'server:member_removed', 'server:kicked', 'server:banned', 'server:role_added', 'server:role_removed'] },
];

function getEventsForTopic(topicName: string): string[] {
  for (const { prefix, events } of TOPIC_EVENTS) {
    if (topicName.startsWith(prefix)) return events;
  }
  return [];
}

function topicNeedsChannelSubscribe(topicName: string): boolean {
  return topicName.startsWith('channel:') || topicName.startsWith('dm:call:');
}

function channelIdFromTopic(topicName: string): string | null {
  if (topicName.startsWith('channel:')) return topicName.slice('channel:'.length);
  if (topicName.startsWith('dm:call:')) return topicName.slice('dm:call:'.length);
  return null;
}

export interface RealtimeManagerState {
  status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
  channelCount: number;
  reconnectAttempts: number;
  queuedEvents: number;
  lastPing: number | null;
  lastPong: number | null;
}

type StateListener = (state: RealtimeManagerState) => void;

type WireMessage = {
  type?: string;
  payload?: unknown;
};

const WS_UNREACHABLE_LOG_THROTTLE_MS = 10000;
const HEARTBEAT_INTERVAL_MS = 30000;
const PONG_TIMEOUT_MS = 10000;
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;
const MAX_QUEUE_SIZE = 100;
const DEDUP_TIME_WINDOW_MS = 5000;
const QUEUE_STORAGE_KEY = 'realtime_queue';

type QueuedFrame = { v: 1; type: string; payload: Record<string, unknown> };

class RealtimeManagerImpl {
  private handlers: Record<string, Record<string, Set<BroadcastCallback>>> = {};
  private stateListeners = new Set<StateListener>();
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectInFlight = false;
  private lastWsUnreachableLog = 0;

  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private lastPong = 0;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = MAX_RECONNECT_ATTEMPTS;
  private readonly baseDelay = BASE_RECONNECT_DELAY_MS;
  private readonly maxDelay = MAX_RECONNECT_DELAY_MS;
  private eventQueue: QueuedFrame[] = [];
  private readonly maxQueueSize = MAX_QUEUE_SIZE;
  private lastEvents = new Map<string, { timestamp: number }>();
  private readonly dedupTimeWindow = DEDUP_TIME_WINDOW_MS;
  private lastPingSent: number | null = null;
  private reconnectingStatus = false;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const saved = sessionStorage.getItem(QUEUE_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as unknown;
          if (Array.isArray(parsed)) {
            this.eventQueue = parsed.filter(
              (f): f is QueuedFrame =>
                f && typeof f === 'object' && f.v === 1 && typeof f.type === 'string' && f.payload && typeof f.payload === 'object' && !Array.isArray(f.payload)
            );
          }
        }
      } catch {
        this.eventQueue = [];
      }
    }
  }

  private saveQueue(): void {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(this.eventQueue));
    } catch {
      // ignore
    }
  }

  private getReconnectDelay(): number {
    const delay = Math.min(
      this.baseDelay * Math.pow(2, this.reconnectAttempts),
      this.maxDelay
    );
    return delay + Math.random() * 1000;
  }

  private getEventHash(type: string, payload: Record<string, unknown>): string {
    return `${type}:${JSON.stringify(payload)}`;
  }

  private pruneLastEvents(): void {
    const now = Date.now();
    for (const [key, entry] of this.lastEvents.entries()) {
      if (now - entry.timestamp >= this.dedupTimeWindow) {
        this.lastEvents.delete(key);
      }
    }
  }

  getState(): RealtimeManagerState {
    const channelCount = Object.keys(this.handlers).length;
    let status: RealtimeManagerState['status'];
    if (this.reconnectingStatus) {
      status = 'reconnecting';
    } else if (this.socket?.readyState === WebSocket.OPEN) {
      status = 'connected';
    } else if (this.socket?.readyState === WebSocket.CONNECTING) {
      status = 'connecting';
    } else {
      status = 'disconnected';
    }
    return {
      status,
      channelCount,
      reconnectAttempts: this.reconnectAttempts,
      queuedEvents: this.eventQueue.length,
      lastPing: this.lastPingSent,
      lastPong: this.lastPong || null,
    };
  }

  subscribe(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.getState());
    return () => this.stateListeners.delete(listener);
  }

  private emitState(): void {
    const state = this.getState();
    this.stateListeners.forEach((l) => l(state));
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.lastPong = Date.now();
    this.heartbeatInterval = setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
      const now = Date.now();
      // Evaluate timeout against the previous ping before sending a new one.
      const noPongSincePing = this.lastPingSent != null
        && now - this.lastPingSent > PONG_TIMEOUT_MS
        && this.lastPong < this.lastPingSent;
      if (noPongSincePing) {
        if (clientEnv.nodeEnv === 'development') {
          console.warn('[Realtime] No pong received, reconnecting...');
        }
        this.stopHeartbeat();
        this.reconnect();
        return;
      }

      this.socket.send(JSON.stringify({ v: 1, type: 'ping', payload: {} }));
      this.lastPingSent = now;
      this.emitState();
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private handlePong(): void {
    this.lastPong = Date.now();
    this.emitState();
  }

  private reconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Realtime] Max reconnect attempts reached');
      this.reconnectingStatus = false;
      this.emitState();
      return;
    }
    this.stopHeartbeat();
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // ignore
      }
      this.socket = null;
    }
    this.connectInFlight = false;
    this.reconnectingStatus = true;
    this.emitState();

    if (!getAccessToken()) {
      if (clientEnv.nodeEnv === 'development') {
        console.warn('[Realtime] No token — skipping reconnect');
      }
      return;
    }

    const delay = this.getReconnectDelay();
    if (clientEnv.nodeEnv === 'development') {
      console.log(
        `[Realtime] Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`
      );
    }

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.reconnectTimer = null;
      this.ensureConnected();
    }, delay);
  }

  private flushQueue(): void {
    while (this.eventQueue.length > 0 && this.socket?.readyState === WebSocket.OPEN) {
      const frame = this.eventQueue.shift();
      if (frame) {
        this.socket.send(JSON.stringify(frame));
      }
    }
    this.saveQueue();
    this.emitState();
  }

  /** WebSocket close code used by gateway for auth failure (do not reconnect in a loop). */
  private static readonly WS_CLOSE_AUTH_FAILED = 4401;

  private ensureConnected(): void {
    if (typeof window === 'undefined') return;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }
    if (this.connectInFlight) return;

    const token = getAccessToken();
    if (!token) {
      this.emitState();
      return;
    }

    this.connectInFlight = true;
    const wsBaseFromEnv = clientEnv.appUrl
      ? clientEnv.appUrl.replace(/^http/, 'ws')
      : null;
    const wsEnv = (clientEnv.wsUrl || wsBaseFromEnv || 'ws://localhost:4001').replace(/\/$/, '');
    const url = `${wsEnv}/?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(url);
    this.socket = ws;
    this.emitState();

    const logWsUnreachable = () => {
      const now = Date.now();
      if (now - this.lastWsUnreachableLog < WS_UNREACHABLE_LOG_THROTTLE_MS) return;
      this.lastWsUnreachableLog = now;
      const envHint = clientEnv.wsUrl ? 'NEXT_PUBLIC_WS_URL' : clientEnv.appUrl ? 'derived from NEXT_PUBLIC_APP_URL' : 'fallback';
      console.warn(
        `[Realtime] WebSocket (${envHint}) unreachable: ${url}. ` +
          'Check that the gateway is running, the URL is correct, and CORS/firewall allow the connection.'
      );
    };

    ws.onopen = () => {
      this.connectInFlight = false;
      this.reconnectAttempts = 0;
      this.reconnectingStatus = false;
      this.lastPong = Date.now();
      this.startHeartbeat();
      this.flushQueue();
      this.resubscribeAllChannels();
      this.emitState();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data)) as WireMessage;
        if (!data?.type) return;
        if (data.type === 'pong') {
          this.handlePong();
          return;
        }
        this.dispatchEvent(data.type, data.payload);
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = (ev) => {
      this.connectInFlight = false;
      this.stopHeartbeat();
      this.reconnectingStatus = false;
      this.emitState();
      if (!ev.wasClean) logWsUnreachable();
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      if (ev.code === RealtimeManagerImpl.WS_CLOSE_AUTH_FAILED) {
        if (clientEnv.nodeEnv === 'development') {
          console.warn('[Realtime] Connection closed due to auth failure (no reconnect loop)');
        }
        return;
      }
      this.reconnect();
    };

    ws.onerror = () => {
      logWsUnreachable();
      try {
        ws.close();
      } catch {
        // ignore
      }
    };
  }

  /** Send a user-initiated frame (e.g. activity, typing). */
  sendUserFrame(type: string, payload: Record<string, unknown>): void {
    this.send({ v: 1, type, payload });
  }

  private send(frame: { v: 1; type: string; payload: Record<string, unknown> }): void {
    this.pruneLastEvents();
    const hash = this.getEventHash(frame.type, frame.payload);
    const last = this.lastEvents.get(hash);
    if (last && Date.now() - last.timestamp < this.dedupTimeWindow) {
      if (clientEnv.nodeEnv === 'development') {
        console.log('[Realtime] Duplicate event ignored', frame.type);
      }
      return;
    }
    this.lastEvents.set(hash, { timestamp: Date.now() });

    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(frame));
      return;
    }

    if (this.eventQueue.length >= this.maxQueueSize) {
      if (clientEnv.nodeEnv === 'development') {
        console.warn('[Realtime] Queue full, dropping oldest event');
      }
      this.eventQueue.shift();
    }
    this.eventQueue.push(frame);
    this.saveQueue();
    this.emitState();
  }

  private subscribeChannel(topicName: string): void {
    const channelId = channelIdFromTopic(topicName);
    if (!channelId) return;
    this.send({
      v: 1,
      type: 'channel:subscribe',
      payload: { channelId },
    });
  }

  private unsubscribeChannel(topicName: string): void {
    const channelId = channelIdFromTopic(topicName);
    if (!channelId) return;
    this.send({
      v: 1,
      type: 'channel:unsubscribe',
      payload: { channelId },
    });
  }

  private resubscribeAllChannels(): void {
    for (const topicName of Object.keys(this.handlers)) {
      if (topicNeedsChannelSubscribe(topicName)) {
        this.subscribeChannel(topicName);
      }
    }
  }

  private dispatchToTopic(topicName: string, event: string, payload: unknown): void {
    const set = this.handlers[topicName]?.[event];
    if (!set) return;
    set.forEach((cb) => {
      try {
        cb(payload);
      } catch (err) {
        if (clientEnv.nodeEnv === 'development') {
          console.error('[RealtimeManager] callback error', topicName, event, err);
        }
      }
    });
  }

  /**
   * Dispatch rules (topic-aware, via event registry):
   * - scope=dm + routingId → dm:call:${id} only
   * - scope=channel + channelId → channel:${channelId}, dm:call:${channelId}
   * - scope=presence → presence
   * - scope=user + userId → user:${userId}
   */
  private dispatchEvent(event: string, payload: unknown): void {
    const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
    const scope = parseExplicitScope(payload) ?? inferScope(event, payload);

    if (scope === 'dm') {
      const id = getRoutingId('dm', p ?? {});
      if (id) this.dispatchToTopic(`dm:call:${id}`, event, payload);
      else if (clientEnv.nodeEnv === 'development') {
        console.warn('[RealtimeManager] DM event missing channelId/dmId', event);
      }
      return;
    }

    if (scope === 'channel') {
      const channelId = getRoutingId('channel', p ?? {});
      if (channelId) {
        this.dispatchToTopic(`channel:${channelId}`, event, payload);
        this.dispatchToTopic(`dm:call:${channelId}`, event, payload);
      } else if (clientEnv.nodeEnv === 'development') {
        console.warn('[RealtimeManager] Channel event missing channelId', event);
      }
    }

    if (scope === 'presence') {
      this.dispatchToTopic('presence', event, payload);
    }

    if (scope === 'user') {
      const userId = getRoutingId('user', p ?? {});
      if (userId) this.dispatchToTopic(`user:${userId}`, event, payload);
    }

    if (!scope && p) {
      const channelId = typeof p.channelId === 'string' ? p.channelId : null;
      const userId = typeof p.userId === 'string' ? p.userId : null;
      if (channelId) {
        this.dispatchToTopic(`channel:${channelId}`, event, payload);
        this.dispatchToTopic(`dm:call:${channelId}`, event, payload);
      }
      if (event === 'presence:update' || event === 'USER_PRESENCE_UPDATE') {
        this.dispatchToTopic('presence', event, payload);
      }
      if (userId) this.dispatchToTopic(`user:${userId}`, event, payload);
    }
  }

  /** Call after token is hydrated (e.g. from /api/auth/me) so WS can connect. */
  tryConnect(): void {
    if (typeof window === 'undefined') return;
    this.ensureConnected();
  }

  subscribeToBroadcast(topicName: string, event: string, callback: BroadcastCallback): () => void {
    if (!topicName) return () => {};
    this.ensureConnected();
    if (!this.handlers[topicName]) {
      this.handlers[topicName] = {};
      const defaultEvents = getEventsForTopic(topicName);
      for (const ev of defaultEvents) this.handlers[topicName][ev] = new Set();
      this.handlers[topicName][event] = this.handlers[topicName][event] ?? new Set();
      if (topicNeedsChannelSubscribe(topicName)) this.subscribeChannel(topicName);
      this.emitState();
    }
    this.handlers[topicName][event] = this.handlers[topicName][event] ?? new Set();
    this.handlers[topicName][event].add(callback);

    return () => {
      const set = this.handlers[topicName]?.[event];
      set?.delete(callback);
      const hasAny = Object.values(this.handlers[topicName] ?? {}).some((s) => s.size > 0);
      if (!hasAny && this.handlers[topicName]) {
        if (topicNeedsChannelSubscribe(topicName)) this.unsubscribeChannel(topicName);
        delete this.handlers[topicName];
        this.emitState();
      }
    };
  }
}

let instance: RealtimeManagerImpl | null = null;

export function getRealtimeManager(): RealtimeManagerImpl {
  if (!instance) {
    instance = new RealtimeManagerImpl();
  }
  return instance;
}
