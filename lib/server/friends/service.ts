/**
 * Friends Service — friend requests, friends list, Redis cache.
 */
import 'server-only';
import { db, withDbRetry } from '@/lib/server/db/client';
import { friends, friendRequests } from '@/lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { cacheKeys, TTL, redisGetJSON, redisSetJSON, redisDel } from '@/lib/server/redis/client';

export type PresenceStatus = 'online' | 'offline' | 'idle' | 'dnd';

export interface FriendDTO {
  id: string;
  username: string;
  avatar: string | null;
  status: PresenceStatus;
}

export interface FriendRequestDTO {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: string;
  createdAt: string;
  fromUser?: { id: string; name: string; avatarUrl: string | null };
  toUser?: { id: string; name: string; avatarUrl: string | null };
}

/** Check if two users are friends. */
export async function areFriends(userId1: string, userId2: string): Promise<boolean> {
  const row = await withDbRetry(
    () => db.query.friends.findFirst({
      where: and(
        eq(friends.userId, userId1),
        eq(friends.friendId, userId2)
      ),
    }),
    'areFriends'
  );
  return !!row;
}

/** Get friends list for user (with Redis cache). */
export async function getFriendsList(userId: string): Promise<FriendDTO[]> {
  const cached = await redisGetJSON<FriendDTO[]>(cacheKeys.friends(userId));
  if (cached) return cached;

  const rows = await withDbRetry(
    () => db.query.friends.findMany({
      where: eq(friends.userId, userId),
      with: {
        friend: {
          columns: { id: true, name: true, avatarUrl: true },
        },
      },
    }),
    'getFriendsList'
  );

  const result: FriendDTO[] = rows.map((r) => {
    const f = Array.isArray(r.friend) ? r.friend[0] : r.friend;
    return {
      id: r.friendId,
      username: f?.name ?? 'Unknown',
      avatar: f?.avatarUrl ?? null,
      status: 'offline' as PresenceStatus, // Status filled by API from presence
    };
  });

  await redisSetJSON(cacheKeys.friends(userId), result, TTL.FRIENDS);
  return result;
}

/** Get friend requests (incoming + outgoing) for user. */
export async function getFriendRequestsDb(userId: string): Promise<{
  incoming: FriendRequestDTO[];
  outgoing: FriendRequestDTO[];
}> {
  const cached = await redisGetJSON<{ incoming: FriendRequestDTO[]; outgoing: FriendRequestDTO[] }>(
    cacheKeys.friendRequests(userId)
  );
  if (cached) return cached;

  const [incomingRows, outgoingRows] = await Promise.all([
    withDbRetry(
      () => db.query.friendRequests.findMany({
        where: and(
          eq(friendRequests.toUserId, userId),
          eq(friendRequests.status, 'pending')
        ),
        with: {
          fromUser: {
            columns: { id: true, name: true, avatarUrl: true },
          },
        },
        orderBy: (r, { desc }) => [desc(r.createdAt)],
      }),
      'getFriendRequests incoming'
    ),
    withDbRetry(
      () => db.query.friendRequests.findMany({
        where: and(
          eq(friendRequests.fromUserId, userId),
          eq(friendRequests.status, 'pending')
        ),
        with: {
          toUser: {
            columns: { id: true, name: true, avatarUrl: true },
          },
        },
        orderBy: (r, { desc }) => [desc(r.createdAt)],
      }),
      'getFriendRequests outgoing'
    ),
  ]);

  const incoming: FriendRequestDTO[] = incomingRows.map((r) => {
    const from = Array.isArray(r.fromUser) ? r.fromUser[0] : r.fromUser;
    return {
      id: r.id,
      fromUserId: r.fromUserId,
      toUserId: r.toUserId,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      fromUser: from ? { id: from.id, name: from.name, avatarUrl: from.avatarUrl } : undefined,
    };
  });

  const outgoing: FriendRequestDTO[] = outgoingRows.map((r) => {
    const to = Array.isArray(r.toUser) ? r.toUser[0] : r.toUser;
    return {
      id: r.id,
      fromUserId: r.fromUserId,
      toUserId: r.toUserId,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      toUser: to ? { id: to.id, name: to.name, avatarUrl: to.avatarUrl } : undefined,
    };
  });

  const result = { incoming, outgoing };
  await redisSetJSON(cacheKeys.friendRequests(userId), result, TTL.FRIEND_REQUESTS);
  return result;
}

export async function invalidateFriendsCache(userId: string): Promise<void> {
  await Promise.all([
    redisDel(cacheKeys.friends(userId)),
    redisDel(cacheKeys.friendRequests(userId)),
  ]);
}

/** Invalidate cache for both users (e.g. when friendship changes). */
export async function invalidateFriendsCacheBoth(userId1: string, userId2: string): Promise<void> {
  await Promise.all([
    invalidateFriendsCache(userId1),
    invalidateFriendsCache(userId2),
  ]);
}
