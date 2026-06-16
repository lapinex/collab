import 'server-only';
import { db } from '@/lib/server/db/client';
import { serverAuditLogs } from '@/lib/server/db/schema';
import { generateId } from '@/lib/utils';
import { redisDel } from '@/lib/server/redis/client';
import { cacheKeys } from '@/lib/server/redis/client';

export interface WriteAuditLogParams {
  serverId: string;
  actorId: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  meta?: Record<string, unknown> | null;
}

/**
 * Write a server-scoped audit log entry (Discord-style).
 * Does not throw; failures are logged only.
 */
export async function writeAuditLog(params: WriteAuditLogParams): Promise<void> {
  try {
    await db.insert(serverAuditLogs).values({
      id: generateId(),
      serverId: params.serverId,
      actorId: params.actorId ?? null,
      action: params.action,
      targetType: params.targetType ?? null,
      targetId: params.targetId ?? null,
      meta: params.meta ?? null,
    });
    // Invalidate audit cache for this server so next GET gets fresh data
    await redisDel(cacheKeys.serverAudit(params.serverId));
  } catch (error) {
    console.error('[audit] writeAuditLog failed:', error);
  }
}
