import type { Connection, WebSocketMessage } from './types.js';
import { sendInternalError, sendMessage } from './connection.js';
import { ConnectionManager } from './connection-manager.js';
import { handleMessageCreate } from './handlers/messages.js';
import { handleTypingStart, handleTypingStop } from './handlers/typing.js';
import { handlePresenceUpdate, handleGetOnlineUsers } from './handlers/presence.js';
import { handleVoiceJoin, handleVoiceLeave } from './handlers/voice.js';
import { handleReactionAdd, handleReactionRemove } from './handlers/reactions.js';
import { handleChannelSubscribe, handleChannelUnsubscribe } from './handlers/channel.js';
import { handleActivity } from './handlers/activity.js';

// Shared connection manager instance
let connectionManagerInstance: ConnectionManager | null = null;

export function setConnectionManager(manager: ConnectionManager): void {
  connectionManagerInstance = manager;
}

export function getConnectionManager(): ConnectionManager {
  if (!connectionManagerInstance) {
    throw new Error('ConnectionManager not initialized');
  }
  return connectionManagerInstance;
}

export async function routeMessage(
  connection: Connection,
  message: WebSocketMessage,
  connectionId?: string
): Promise<void> {
  // Protocol v1 enforcement
  if (!message || typeof message !== 'object') {
    sendInternalError(connection.ws, { code: 'BAD_PAYLOAD', message: 'Invalid frame' });
    return;
  }

  const { v, type, payload, requestId, nonce } = message;

  if (v !== 1 || typeof type !== 'string' || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
    sendInternalError(connection.ws, { code: 'BAD_PAYLOAD', message: 'Invalid frame schema' }, requestId, nonce);
    return;
  }

  try {
    switch (type) {
      case 'message:create':
        await handleMessageCreate(connection, payload, requestId, nonce);
        break;

      case 'typing:start':
        await handleTypingStart(connection, payload);
        break;

      case 'typing:stop':
        await handleTypingStop(connection, payload);
        break;

      case 'activity':
        await handleActivity(connection, payload);
        break;

      case 'presence:update':
        await handlePresenceUpdate(connection, payload, requestId);
        break;

      case 'voice:join':
        await handleVoiceJoin(connection, payload, requestId);
        break;

      case 'voice:leave':
        await handleVoiceLeave(connection, payload, requestId);
        break;

      case 'reaction:add':
        await handleReactionAdd(connection, payload, requestId);
        break;

      case 'reaction:remove':
        await handleReactionRemove(connection, payload, requestId);
        break;

      case 'channel:subscribe':
        await handleChannelSubscribe(connection, payload, requestId, connectionId);
        break;

      case 'channel:unsubscribe':
        handleChannelUnsubscribe(connection, payload, requestId);
        if (connectionId && typeof payload.channelId === 'string') {
          try {
            const manager = getConnectionManager();
            manager.unsubscribeFromChannel(connectionId, payload.channelId);
          } catch {
            // ignore
          }
        }
        break;

      case 'ping':
        sendMessage(connection.ws, 'pong', {}, requestId);
        break;

      case 'GET_ONLINE_USERS':
        handleGetOnlineUsers(connection, requestId);
        break;

      default:
        sendInternalError(connection.ws, { code: 'BAD_PAYLOAD', message: `Unknown type: ${type}` }, requestId, nonce);
    }
  } catch (error) {
    console.error('Error routing message:', error);
    sendInternalError(
      connection.ws,
      { code: 'UNKNOWN', message: error instanceof Error ? error.message : 'Internal server error' },
      requestId,
      nonce
    );
  }
}
