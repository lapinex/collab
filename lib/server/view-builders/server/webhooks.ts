import { db, withDbRetry } from '@/lib/server/db/client';
import { webhooks } from '@/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { hasPermission } from '@/lib/permissions/constants';
import { Permission } from '@/types/permissions';

export async function buildWebhooksPart(serverId: string, permissions: number) {
  if (!hasPermission(permissions, Permission.MANAGE_WEBHOOKS)) {
    return [];
  }

  return withDbRetry(
    () =>
      db.query.webhooks.findMany({
        where: eq(webhooks.serverId, serverId),
        orderBy: (webhooks, { asc }) => [asc(webhooks.name)],
      }),
    'buildWebhooksPart'
  );
}
