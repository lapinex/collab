import type { Connection } from '../types.js';
import { sendMessage, sendPermissionError, sendInternalError } from '../connection.js';
import { getDb } from '../db.js';
import { channels as dbChannels, dmChannels as dbDmChannels } from '@collab/lib/db/schema';
import { and, eq, or } from 'drizzle-orm';
import { checkMVPPermissionNoCache } from '../permissions.js';
import { getConnectionManager } from '../router.js';

export async function handleChannelSubscribe(
  connection: Connection,
  payload: Record<string, unknown>,
  requestId: string | undefined,
  connectionId: string | undefined
): Promise<void> {
  const channelId = typeof payload.channelId === 'string' ? payload.channelId : null;
  if (!channelId) {
    sendInternalError(connection.ws, { code: 'BAD_PAYLOAD', message: 'channelId required' }, requestId);
    return;
  }

  try {
    const db = getDb();
    const channel = await db.query.channels.findFirst({
      where: eq(dbChannels.id, channelId),
      columns: { id: true, serverId: true },
    });

    if (!channel) {
      // DM channel support: allow subscribe only for participants.
      const dm = await db.query.dmChannels.findFirst({
        where: and(
          eq(dbDmChannels.id, channelId),
          or(eq(dbDmChannels.user1Id, connection.userId), eq(dbDmChannels.user2Id, connection.userId))
        ),
        columns: { id: true },
      });
      if (!dm) {
        sendPermissionError(connection.ws, { code: 'PERMISSION_DENIED', message: 'Channel not found' }, requestId);
        return;
      }
    } else {
      const canView = await checkMVPPermissionNoCache(
        db,
        connection.userId,
        channel.serverId,
        'canViewChannel'
      );
      if (!canView) {
        sendPermissionError(connection.ws, { code: 'PERMISSION_DENIED', message: 'Insufficient permissions' }, requestId);
        return;
      }
    }

    // Update in-memory subscription state
    connection.subscribedChannels.add(channelId);
    const manager = getConnectionManager();
    if (connectionId) {
      manager.subscribeToChannel(connectionId, channelId);
    }
    sendMessage(connection.ws, 'channel:subscribed', { channelId }, requestId);
  } catch (err) {
    sendInternalError(
      connection.ws,
      { code: 'UNKNOWN', message: err instanceof Error ? err.message : 'Internal error' },
      requestId
    );
  }
}

export function handleChannelUnsubscribe(
  connection: Connection,
  payload: Record<string, unknown>,
  requestId?: string
): void {
  const channelId = typeof payload.channelId === 'string' ? payload.channelId : null;
  if (!channelId) {
    sendInternalError(connection.ws, { code: 'BAD_PAYLOAD', message: 'channelId required' }, requestId);
    return;
  }

  connection.subscribedChannels.delete(channelId);
  sendMessage(connection.ws, 'channel:unsubscribed', { channelId }, requestId);
}

