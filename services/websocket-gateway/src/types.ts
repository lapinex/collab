import { WebSocket as WSWebSocket } from 'ws';

export interface WebSocketMessage {
  v: 1;
  type: string;
  payload: Record<string, unknown>;
  nonce?: string;
  requestId?: string;
}

export type WsErrorCode =
  | 'BAD_PAYLOAD'
  | 'DB_WRITE_FAILED'
  | 'REDIS_PUBLISH_FAILED'
  | 'AUTH_INVALID'
  | 'AUTH_EXPIRED'
  | 'AUTH_MISSING'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'IN_FLIGHT'
  | 'UNKNOWN';

export interface AuthenticatedConnection {
  userId: string;
  email?: string;
  /** Display name for typing indicator etc. (never expose email). */
  name?: string | null;
  connectedAt: Date;
  lastHeartbeat: Date;
  subscribedChannels: Set<string>;
}

export interface Connection extends AuthenticatedConnection {
  ws: WSWebSocket;
  ipAddress?: string;
  userAgent?: string;
}
