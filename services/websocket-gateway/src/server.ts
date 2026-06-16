// 🚨 CRITICAL: Bootstrap MUST be imported FIRST before any other imports
// This ensures .env.gateway is loaded before any module reads process.env
import './bootstrap.js';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import {
  authenticateConnection,
  sendMessage,
  sendAuthError,
  sendInternalError,
  isConnectionAlive,
} from './connection.js';
import { ConnectionManager } from './connection-manager.js';
import { routeMessage, setConnectionManager } from './router.js';
import { closeAllVoiceSessionsForUser } from './handlers/voice.js';
import {
  initPubSub,
  getSubscriber,
  getPubSubPublisher,
  safePublish,
  closePubSubRedis,
} from '@collab/lib/redis/pubsub';
import { generateId } from '../../../shared/utils.js';
import { checkHealth } from './health.js';
import type { Connection } from './types.js';

// ============================
// PORT (RAILWAY COMPATIBLE)
// ============================
const PORT = Number(process.env.PORT ?? 8080);
if (!process.env.PORT) {
  console.warn('[WARN] PORT not set, defaulting to 8080');
}

const connectionManager = new ConnectionManager();
setConnectionManager(connectionManager);

// ============================
// HTTP SERVER (REQUIRED)
// ============================
const httpServer = createServer(async (req, res) => {
  if (req.url === '/health/ready') {
    const health = await checkHealth();
    res.writeHead(health.status === 'healthy' ? 200 : 503, {
      'Content-Type': 'application/json',
    });
    res.end(JSON.stringify(health));
    return;
  }
  res.writeHead(404);
  res.end();
});

// ============================
// REDIS PUB/SUB
// ============================
let pubSubRedis: ReturnType<typeof getSubscriber> = null!;
void (async () => {
  try {
    await initPubSub();
    pubSubRedis = getSubscriber()!;
    if (pubSubRedis) {
      pubSubRedis.on('pmessage', (_pattern: string, channel: string, message: string) => {
        try {
          const data = JSON.parse(message) as { event?: string; payload?: unknown; userId?: string; type?: string };
          if (channel.startsWith('realtime:')) {
            const topic = channel.slice('realtime:'.length);
            const event = typeof data?.event === 'string' ? data.event : null;
            const payload = data?.payload ?? data;
            if (!event) return;
            if (topic.startsWith('channel:')) {
              const channelId = topic.slice('channel:'.length);
              if (!channelId) return;
              connectionManager.broadcastToChannel(channelId, event, payload);
              return;
            }
            if (topic === 'presence') {
              connectionManager.broadcastToAll(event, payload);
              return;
            }
            if (topic.startsWith('user:')) {
              const userId = topic.slice('user:'.length);
              if (!userId) return;
              connectionManager.broadcastToUser(userId, event, payload);
              return;
            }
            if (topic.startsWith('dm:call:')) {
              const channelId = topic.slice('dm:call:'.length);
              if (!channelId) return;
              connectionManager.broadcastToChannel(channelId, event, payload);
              return;
            }
          }
          if (channel === 'presence:global') {
            connectionManager.broadcastToAll('USER_PRESENCE_UPDATE', data);
            return;
          }
          const channelId = channel.split(':')[1];
          if (!channelId) return;
          if (channel.startsWith('messages:')) {
            connectionManager.broadcastToChannel(channelId, 'message:created', data);
          } else if (channel.startsWith('typing:')) {
            connectionManager.broadcastToChannel(
              channelId,
              data.type === 'start' ? 'typing:started' : 'typing:stopped',
              data
            );
          } else if (channel.startsWith('presence:')) {
            connectionManager.broadcastToUser(data.userId!, 'presence:updated', data);
          } else if (channel.startsWith('voice:')) {
            connectionManager.broadcastToChannel(
              channelId,
              data.type === 'join' ? 'voice:joined' : 'voice:left',
              data
            );
          } else if (channel.startsWith('dms:')) {
            connectionManager.broadcastToChannel(channelId, 'dm:message:created', data);
          }
        } catch (err) {
          console.error('[Redis] Message error:', err);
        }
      });
      try {
        await pubSubRedis.psubscribe(
          'messages:*',
          'typing:*',
          'presence:*',
          'voice:*',
          'dms:*',
          'realtime:*'
        );
        console.log('[Gateway] Redis pub/sub ready');
      } catch (err) {
        console.warn('[Gateway] Redis subscribe failed → single-instance mode', err);
      }
    } else {
      console.warn('[Gateway] Redis unavailable → single-instance mode');
    }
  } catch (err) {
    console.error('[Gateway] Redis init failed:', err);
  }
})();

// ============================
// WEBSOCKET SERVER
// ============================
const wss = new WebSocketServer({
  server: httpServer,
  handleProtocols: (protocols: Set<string>) => {
    const first = Array.from(protocols)[0];
    return first ?? false;
  },
});

// 🚨 CRITICAL: listen on 0.0.0.0
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[Gateway] Listening on 0.0.0.0:${PORT}`);
});

// ============================
// WS CONNECTION HANDLER
// ============================
wss.on('connection', async (ws, req) => {
  const connectionId = generateId();
  let connection: Connection | null = null;
  const host = req.headers.host ?? 'gateway';
  const url = new URL(req.url || '/', `http://${host}`);
  const authHeader = req.headers.authorization;
  const protocolHeader = req.headers['sec-websocket-protocol'];
  let token: string | null = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }
  if (!token && protocolHeader) {
    const protocols = Array.isArray(protocolHeader)
      ? protocolHeader.flatMap((value: string) => value.split(','))
      : (protocolHeader as string).split(',');
    const trimmed = protocols.map((v: string) => v.trim()).filter(Boolean);
    for (let i = 0; i < trimmed.length; i++) {
      const entry = trimmed[i];
      if (entry.startsWith('bearer.')) {
        token = entry.substring('bearer.'.length);
        break;
      }
      if (entry.toLowerCase() === 'bearer' && trimmed[i + 1]) {
        token = trimmed[i + 1];
        break;
      }
    }
  }
  if (!token) {
    token = url.searchParams.get('token');
  }
  const WS_CLOSE_AUTH_FAILED = 4401;
  if (!token) {
    sendAuthError(ws, { code: 'AUTH_MISSING', message: 'Authentication token required' });
    ws.close(WS_CLOSE_AUTH_FAILED, 'AUTH_MISSING');
    return;
  }
  const auth = await authenticateConnection(ws, token);
  if (!auth) {
    sendAuthError(ws, { code: 'AUTH_INVALID', message: 'Invalid authentication token' });
    ws.close(WS_CLOSE_AUTH_FAILED, 'AUTH_INVALID');
    return;
  }
  connection = {
    ...auth,
    ws,
    ipAddress: req.socket.remoteAddress ?? undefined,
    userAgent: req.headers['user-agent'],
  } as Connection;
  connectionManager.addConnection(connectionId, connection);
  const wasOffline = connectionManager.getConnectionCountForUser(connection.userId) === 1;
  if (wasOffline) {
    void (async () => {
      try {
        const redis = getPubSubPublisher();
        await redis.sadd('presence:online:users', connection!.userId);
      } catch {
        // Redis unavailable or not configured
      }
    })();
    safePublish('presence:global', JSON.stringify({ userId: connection.userId, online: true }));
    connectionManager.broadcastToAll('USER_PRESENCE_UPDATE', { userId: connection.userId, online: true });
  }
  sendMessage(ws, 'connected', {
    connectionId,
    userId: connection.userId,
    protocol: { v: 1 },
  });
  ws.on('message', async (data: Buffer | Buffer[]) => {
    try {
      const message = JSON.parse(data.toString());
      connectionManager.updateHeartbeat(connectionId);
      await routeMessage(connection!, message, connectionId);
    } catch {
      sendInternalError(ws, { code: 'BAD_PAYLOAD', message: 'Invalid JSON payload' });
    }
  });
  ws.on('pong', () => {
    connectionManager.updateHeartbeat(connectionId);
  });
  const heartbeat = setInterval(() => {
    if (!connection || !isConnectionAlive(connection)) {
      ws.close();
      clearInterval(heartbeat);
      return;
    }
    try {
      ws.ping();
    } catch {
      ws.close();
      clearInterval(heartbeat);
    }
  }, 30000);
  ws.on('close', () => {
    clearInterval(heartbeat);
    const wasLastConnection =
      connection && connectionManager.getConnectionCountForUser(connection.userId) === 1;
    const userId = connection?.userId;
    connectionManager.removeConnection(connectionId);
    if (userId) {
      void closeAllVoiceSessionsForUser(userId);
    }
    if (wasLastConnection && userId) {
      void (async () => {
        try {
          const redis = getPubSubPublisher();
          await redis.srem('presence:online:users', userId);
        } catch {
          // Redis unavailable or not configured
        }
      })();
      safePublish('presence:global', JSON.stringify({ userId, online: false }));
      connectionManager.broadcastToAll('USER_PRESENCE_UPDATE', { userId, online: false });
    }
  });
});

// ============================
// CLEANUP
// ============================
setInterval(() => {
  for (const [id, conn] of (connectionManager as unknown as { connections: Map<string, Connection> })
    .connections.entries()) {
    if (!isConnectionAlive(conn)) {
      connectionManager.removeConnection(id);
      conn.ws?.close();
    }
  }
}, 60000);

// ============================
// GRACEFUL SHUTDOWN
// ============================
const shutdownTimeoutMs = 5000;
const forceExitMs = 15000;
const gracefulShutdown = (signal: string) => {
  console.log(`[Gateway] ${signal} received, starting graceful shutdown...`);
  let forceExitTimer: ReturnType<typeof setTimeout> | null = null;
  const forceExit = () => {
    if (forceExitTimer) return;
    console.error('[Gateway] Forceful shutdown after timeout');
    process.exit(1);
  };
  forceExitTimer = setTimeout(forceExit, forceExitMs);
  wss.close(() => {
    console.log('[Gateway] WebSocket server closed, remaining clients:', wss.clients.size);
    setTimeout(async () => {
      wss.clients.forEach((client) => client.terminate());
      try {
        await closePubSubRedis();
        console.log('[Gateway] Redis connections closed');
      } catch (err) {
        console.error('[Gateway] Error closing Redis:', err);
      }
      httpServer.close(() => {
        if (forceExitTimer) clearTimeout(forceExitTimer);
        console.log('[Gateway] HTTP server closed');
        process.exit(0);
      });
    }, shutdownTimeoutMs);
  });
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
