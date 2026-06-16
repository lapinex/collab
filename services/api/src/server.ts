import express from 'express';
import { infra, redis, sql } from './infra.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerMessageRoutes } from './routes/messages.js';
import { registerPresenceRoutes } from './routes/presence.js';
import { registerNotificationRoutes } from './routes/notifications.js';
import { registerFriendRoutes } from './routes/friends.js';
import { registerUserRoutes } from './routes/users.js';
import { registerDmRoutes } from './routes/dms.js';
import { registerServerRoutes } from './routes/servers.js';
import { registerChannelRoutes } from './routes/channels.js';
import { registerInviteRoutes } from './routes/invites.js';
import { registerVoiceRoutes } from './routes/voice.js';
import { registerMediaRoutes } from './routes/media.js';
import { registerMiscRoutes } from './routes/misc.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerCommandRoutes } from './routes/commands.js';

console.log('=== STARTUP DEBUG ===');
console.log('PORT:', process.env.PORT);
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('REDIS_URL exists:', !!process.env.REDIS_URL);
console.log('JWT_SECRET exists:', !!process.env.JWT_SECRET);
console.log('=== END STARTUP DEBUG ===');

const app = express();
infra.setupAppMiddleware(app);

const deps = { app, sql, redis, infra };

registerAuthRoutes(deps);
registerMessageRoutes(deps);
registerPresenceRoutes(deps);
registerNotificationRoutes(deps);
registerFriendRoutes(deps);
registerUserRoutes(deps);
registerDmRoutes(deps);
registerServerRoutes(deps);
registerChannelRoutes(deps);
registerInviteRoutes(deps);
registerVoiceRoutes(deps);
registerMediaRoutes(deps);
registerMiscRoutes(deps);
registerAdminRoutes(deps);
registerCommandRoutes(deps);

const server = app.listen(infra.PORT, '0.0.0.0', () => {
  console.log(`[API] Listening on 0.0.0.0:${infra.PORT} (PORT=${process.env.PORT ?? 'not set'})`);
});

const gracefulShutdown = async (signal: string) => {
  console.log(`[API] ${signal} received, closing server...`);
  server.close(async () => {
    console.log('[API] HTTP server closed');
    try {
      await redis.quit().catch(() => undefined);
      await sql.end({ timeout: 5 }).catch(() => undefined);
    } catch (err) {
      console.error('[API] Error closing connections:', err);
    }
    process.exit(0);
  });
  setTimeout(() => {
    console.error('[API] Could not close connections in time, forcefully exiting');
    process.exit(1);
  }, 10_000);
};

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
