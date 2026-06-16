import type { Connection } from '../types.js';
import { sendMessage, sendError } from '../connection.js';

export async function handleReactionAdd(
  connection: Connection,
  payload: unknown,
  requestId?: string
): Promise<void> {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('messageId' in payload) ||
    !('emoji' in payload)
  ) {
    sendError(connection.ws, 'Invalid payload', requestId);
    return;
  }

  const { messageId, emoji } = payload as { messageId: string; emoji: string };

  // This is handled via REST API, but we can broadcast the event
  // The actual reaction creation happens in the REST API endpoint
  const reactionPayload = {
    messageId,
    userId: connection.userId,
    emoji,
  };

  // Broadcast to channel subscribers
  // Note: We need to get channelId from messageId, but for MVP we'll rely on REST API
  // WebSocket handler is mainly for broadcasting
  sendMessage(connection.ws, 'reaction:added', reactionPayload, requestId);
}

export async function handleReactionRemove(
  connection: Connection,
  payload: unknown,
  requestId?: string
): Promise<void> {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('messageId' in payload)
  ) {
    sendError(connection.ws, 'Invalid payload', requestId);
    return;
  }

  const { messageId } = payload as { messageId: string };

  const reactionPayload = {
    messageId,
    userId: connection.userId,
  };

  sendMessage(connection.ws, 'reaction:removed', reactionPayload, requestId);
}
