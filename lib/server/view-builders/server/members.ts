import { db, withDbRetry } from '@/lib/server/db/client';
import { userRoles, users, serverProfiles } from '@/lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { cacheKeys, redisGetJSON, redisSetJSON, redisDel, TTL } from '@/lib/server/redis/client';

export type MembersPreviewItem = {
  id: string;
  userId: string;
  name: string;
  nickname: string | null;
  roles: Array<{ id: string; name: string; color: string; position: number }>;
  avatar: string | null;
  isOwner: boolean;
};

/** Invalidate server members cache (call when roles/members change). */
export async function invalidateServerMembersCache(serverId: string): Promise<void> {
  try {
    await redisDel(cacheKeys.serverMembers(serverId));
  } catch (err) {
    console.warn('[invalidateServerMembersCache]', err);
  }
}

export async function buildMembersPart(serverId: string, ownerId: string): Promise<MembersPreviewItem[]> {
  const cacheKey = cacheKeys.serverMembers(serverId);
  const cached = await redisGetJSON<MembersPreviewItem[]>(cacheKey);
  if (cached && Array.isArray(cached)) {
    return cached;
  }

  const [memberRoles, owner] = await Promise.all([
    withDbRetry(
      () =>
        db.query.userRoles.findMany({
          where: eq(userRoles.serverId, serverId),
          with: {
            user: {
              columns: {
                id: true,
                name: true,
                avatarUrl: true,
              },
            },
            role: {
              columns: {
                id: true,
                name: true,
                color: true,
                position: true,
              },
            },
          },
        }),
      'buildMembersPart (memberRoles)'
    ),
    withDbRetry(
      () =>
        db.query.users.findFirst({
          where: eq(users.id, ownerId),
          columns: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        }),
      'buildMembersPart (owner)'
    ),
  ]);

  const allUserIds = new Set<string>();
  if (owner) allUserIds.add(owner.id);
  for (const mr of memberRoles) {
    const u = Array.isArray(mr.user) ? mr.user[0] : mr.user;
    if (u) allUserIds.add(u.id as string);
  }

  const profiles =
    allUserIds.size > 0
      ? await withDbRetry(
          () =>
            db
              .select()
              .from(serverProfiles)
              .where(
                and(
                  eq(serverProfiles.serverId, serverId),
                  inArray(serverProfiles.userId, Array.from(allUserIds))
                )
              ),
          'buildMembersPart (profiles)'
        )
      : [];

  const profilesMap = new Map(
    profiles.map((p) => [
      p.userId,
      { nickname: p.nickname, avatarUrl: p.avatarUrl },
    ])
  );

  const membersPreviewMap = new Map<string, MembersPreviewItem>();

  if (owner) {
    const prof = profilesMap.get(owner.id);
    membersPreviewMap.set(owner.id, {
      id: owner.id,
      userId: owner.id,
      name: owner.name,
      nickname: prof?.nickname ?? null,
      roles: [],
      avatar: prof?.avatarUrl ?? owner.avatarUrl,
      isOwner: true,
    });
  }

  for (const mr of memberRoles) {
    const u = Array.isArray(mr.user) ? mr.user[0] : mr.user;
    const role = Array.isArray(mr.role) ? mr.role[0] : mr.role;
    if (!u || !role) continue;
    const memberUserId = u.id as string;
    const prof = profilesMap.get(memberUserId);
    const existing = membersPreviewMap.get(memberUserId);
    const roleSummary = {
      id: role.id as string,
      name: role.name as string,
      color: role.color as string,
      position: role.position as number,
    };
    if (existing) {
      existing.roles.push(roleSummary);
    } else {
      membersPreviewMap.set(memberUserId, {
        id: memberUserId,
        userId: memberUserId,
        name: u.name as string,
        nickname: prof?.nickname ?? null,
        roles: [roleSummary],
        avatar: prof?.avatarUrl ?? (u.avatarUrl as string | null),
        isOwner: memberUserId === ownerId,
      });
    }
  }

  const membersPreview = Array.from(membersPreviewMap.values()).map((m) => ({
    ...m,
    roles: m.roles.sort((a, b) => b.position - a.position),
  }));

  membersPreview.sort((a, b) => {
    if (a.userId === ownerId) return -1;
    if (b.userId === ownerId) return 1;
    const aMax = a.roles.length ? Math.max(...a.roles.map((r) => r.position)) : 0;
    const bMax = b.roles.length ? Math.max(...b.roles.map((r) => r.position)) : 0;
    return bMax - aMax;
  });

  await redisSetJSON(cacheKey, membersPreview, TTL.SERVER_MEMBERS);
  return membersPreview;
}
