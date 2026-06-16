import { db, withDbRetry } from '@/lib/server/db/client';
import { userRoles } from '@/lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { buildServerBase } from './base';
import { buildChannelsPart } from './channels';
import { buildRolesPart } from './roles';
import { buildMembersPart } from './members';
import { buildAssetsPart } from './assets';
import { buildWebhooksPart } from './webhooks';
import { buildPermissionsPart } from './permissions';

export async function buildServerView(userId: string, serverId: string) {
  const server = await buildServerBase(serverId);

  const isOwner = server.ownerId === userId;
  const isMember = await withDbRetry(
    () =>
      db.query.userRoles.findFirst({
        where: and(
          eq(userRoles.userId, userId),
          eq(userRoles.serverId, serverId)
        ),
      }),
    'buildServerView (access)'
  );

  if (!isOwner && !isMember) {
    const err = new Error('Insufficient permissions');
    (err as Error & { status?: number }).status = 403;
    throw err;
  }

  const [permissionsPart, channels, roles, assets, membersPreview] = await Promise.all([
    buildPermissionsPart(userId, serverId),
    buildChannelsPart(serverId),
    buildRolesPart(serverId),
    buildAssetsPart(serverId),
    buildMembersPart(serverId, server.ownerId),
  ]);

  const webhooks = await buildWebhooksPart(serverId, permissionsPart.calculated.final);

  return {
    server,
    channels,
    roles,
    emojis: assets.emojis,
    stickers: assets.stickers,
    webhooks,
    membersPreview,
    currentUserPermissions: permissionsPart.currentUserPermissions,
  };
}

export { buildServerBase } from './base';
export { buildChannelsPart } from './channels';
export { buildRolesPart } from './roles';
export { buildMembersPart } from './members';
export type { MembersPreviewItem } from './members';
export { buildAssetsPart } from './assets';
export { buildWebhooksPart } from './webhooks';
export { buildPermissionsPart } from './permissions';
