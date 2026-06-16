import { db, withDbRetry } from '@/lib/server/db/client';
import { dmChannels } from '@/lib/server/db/schema';
import { eq, or, and } from 'drizzle-orm';

export async function buildDmView(userId: string, channelId: string) {
  const channelRow = await withDbRetry(
    () =>
      db.query.dmChannels.findFirst({
        where: and(
          eq(dmChannels.id, channelId),
          or(
            eq(dmChannels.user1Id, userId),
            eq(dmChannels.user2Id, userId)
          )
        ),
        with: {
          user1: {
            columns: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
          user2: {
            columns: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
          lastMessage: {
            columns: {
              id: true,
              content: true,
              createdAt: true,
              userId: true,
            },
            with: {
              user: {
                columns: {
                  id: true,
                  name: true,
                  avatarUrl: true,
                },
              },
            },
          },
        },
      }),
    'buildDmView'
  );

  if (!channelRow) {
    const err = new Error('DM channel not found or access denied');
    (err as Error & { status?: number }).status = 404;
    throw err;
  }

  const user1Data = Array.isArray(channelRow.user1) ? channelRow.user1[0] : channelRow.user1;
  const user2Data = Array.isArray(channelRow.user2) ? channelRow.user2[0] : channelRow.user2;
  const lastMessageRow = Array.isArray(channelRow.lastMessage)
    ? channelRow.lastMessage[0]
    : channelRow.lastMessage;
  const lastMessageUser =
    lastMessageRow && 'user' in lastMessageRow
      ? Array.isArray(lastMessageRow.user)
        ? lastMessageRow.user[0]
        : lastMessageRow.user
      : null;

  const participants = [user1Data, user2Data].filter(Boolean).map((u) => ({
    id: u!.id,
    name: u!.name,
    avatarUrl: u!.avatarUrl,
  }));

  const otherUser =
    channelRow.user1Id === userId ? user2Data : user1Data;
  const channel = {
    id: channelRow.id,
    user1Id: channelRow.user1Id,
    user2Id: channelRow.user2Id,
    lastMessageId: channelRow.lastMessageId,
    lastMessageAt: channelRow.lastMessageAt?.toISOString() ?? null,
    createdAt: channelRow.createdAt.toISOString(),
    updatedAt: channelRow.updatedAt.toISOString(),
    otherUser: otherUser
      ? {
          id: otherUser.id,
          name: otherUser.name,
          avatarUrl: otherUser.avatarUrl,
        }
      : { id: '', name: 'Unknown', avatarUrl: null },
    lastMessage: lastMessageRow
      ? {
          id: lastMessageRow.id,
          content: lastMessageRow.content,
          createdAt: lastMessageRow.createdAt.toISOString(),
          userId: lastMessageRow.userId,
          user: lastMessageUser
            ? {
                id: lastMessageUser.id,
                name: lastMessageUser.name,
                avatarUrl: lastMessageUser.avatarUrl,
              }
            : null,
        }
      : null,
  };

  const lastMessagePreview = lastMessageRow
    ? {
        id: lastMessageRow.id,
        content: lastMessageRow.content,
        createdAt: lastMessageRow.createdAt.toISOString(),
        userId: lastMessageRow.userId,
        user: lastMessageUser
          ? {
              id: lastMessageUser.id,
              name: lastMessageUser.name,
              avatarUrl: lastMessageUser.avatarUrl,
            }
          : null,
      }
    : null;

  return {
    channel,
    participants,
    lastMessagePreview,
  };
}
