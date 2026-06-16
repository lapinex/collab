'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfileContext } from '@/contexts/UserProfileContext';
import { useServers } from '@/hooks/useServers';
import { ServerList } from '@/components/server/ServerList';
import { UserCard } from '@/components/friends/UserCard';
import { UserSettingsModal } from '@/components/settings/UserSettingsModal';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { apiGet, apiPost, apiDelete } from '@/lib/api-client';
import { buildAppUrl } from '@/lib/navigation/appStateUrl';

type FriendsTab = 'all' | 'online' | 'incoming' | 'outgoing' | 'blocked';

interface FriendDTO {
  id: string;
  username: string;
  avatar: string | null;
  status: 'online' | 'offline' | 'idle' | 'dnd';
}

interface FriendRequestDTO {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: string;
  createdAt: string;
  fromUser?: { id: string; name: string; avatarUrl: string | null };
  toUser?: { id: string; name: string; avatarUrl: string | null };
}

interface BlockItem {
  id: string;
  user: { id: string; name: string; avatarUrl: string | null } | null;
}

export default function FriendsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { openUserProfile } = useUserProfileContext();
  const { servers, invalidateServers } = useServers();
  const [activeTab, setActiveTab] = useState<FriendsTab>('all');
  const [friends, setFriends] = useState<FriendDTO[]>([]);
  const [incoming, setIncoming] = useState<FriendRequestDTO[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequestDTO[]>([]);
  const [blocks, setBlocks] = useState<BlockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUserSettingsOpen, setIsUserSettingsOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [friendsRes, requestsRes, blocksRes] = await Promise.all([
        apiGet<{ friends: FriendDTO[] }>('/api/friends'),
        apiGet<{ incoming: FriendRequestDTO[]; outgoing: FriendRequestDTO[] }>('/api/friends/requests'),
        apiGet<{ blocks: BlockItem[] }>('/api/users/me/blocks'),
      ]);
      setFriends(friendsRes.friends ?? []);
      setIncoming(requestsRes.incoming ?? []);
      setOutgoing(requestsRes.outgoing ?? []);
      setBlocks(blocksRes.blocks ?? []);
    } catch {
      setFriends([]);
      setIncoming([]);
      setOutgoing([]);
      setBlocks([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAccept = async (requestId: string) => {
    await apiPost(`/api/friends/requests/${requestId}/accept`, {});
    await load();
  };

  const handleDecline = async (requestId: string) => {
    await apiPost(`/api/friends/requests/${requestId}/decline`, {});
    await load();
  };

  const handleCancel = async (requestId: string) => {
    await apiPost(`/api/friends/requests/${requestId}/cancel`, {});
    await load();
  };

  const handleRemoveFriend = async (friendId: string) => {
    await apiDelete(`/api/friends/${friendId}`);
    await load();
  };

  const handleBlock = async (userId: string) => {
    await apiPost('/api/users/me/block', { userId });
    await load();
  };

  const handleUnblock = async (userId: string) => {
    await apiDelete(`/api/users/me/block/${userId}`);
    await load();
  };

  const handleMessage = async (userId: string) => {
    try {
      const res = await apiPost<{ channel: { id: string } }>('/api/dms/channels', { userId });
      const dmId = res.channel?.id;
      if (dmId) {
        router.push(buildAppUrl({ tab: 'dms', dmId }));
      } else {
        router.push('/app');
      }
    } catch {
      router.push('/app');
    }
  };

  const onlineFriends = friends.filter((f) => f.status === 'online' || f.status === 'idle' || f.status === 'dnd');

  return (
    <div className="flex h-screen bg-bg-primary">
      <div className="w-[72px] flex-shrink-0">
        <ServerList
          servers={servers}
          selectedServerId={undefined}
          onSelectServer={() => router.push('/app')}
          onServerCreated={(_s) => {
            invalidateServers();
            router.push('/app');
          }}
          onServerJoined={(_s) => {
            invalidateServers();
            router.push('/app');
          }}
          onUserSettingsClick={() => setIsUserSettingsOpen(true)}
        />
      </div>

      <div className="w-60 flex-shrink-0 flex flex-col bg-bg-tertiary border-r border-border-primary">
        <div className="p-4 border-b border-border-primary">
          <h2 className="text-lg font-semibold text-text-primary">Friends</h2>
        </div>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FriendsTab)}>
          <TabsList className="w-full rounded-none border-b border-border-primary bg-transparent h-auto flex flex-col">
            <TabsTrigger value="all" className="w-full justify-start rounded-none border-b-0">
              All
            </TabsTrigger>
            <TabsTrigger value="online" className="w-full justify-start rounded-none border-b-0">
              Online
            </TabsTrigger>
            <TabsTrigger value="incoming" className="w-full justify-start rounded-none border-b-0">
              Pending
            </TabsTrigger>
            <TabsTrigger value="outgoing" className="w-full justify-start rounded-none border-b-0">
              Outgoing
            </TabsTrigger>
            <TabsTrigger value="blocked" className="w-full justify-start rounded-none border-b-0">
              Blocked
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="space-y-2 p-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-bg-quaternary rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              {activeTab === 'all' && (
                <div className="space-y-1">
                  {friends.length === 0 ? (
                    <p className="p-4 text-text-muted text-sm">No friends yet</p>
                  ) : (
                    friends.map((f) => (
                      <UserCard
                        key={f.id}
                        user={{ id: f.id, username: f.username, avatar: f.avatar, status: f.status }}
                        relationship="friend"
                        currentUserId={user?.id ?? ''}
                        onClick={() => openUserProfile(f.id)}
                        onRemoveFriend={handleRemoveFriend}
                        onBlock={handleBlock}
                        onMessage={handleMessage}
                        canMessage
                      />
                    ))
                  )}
                </div>
              )}
              {activeTab === 'online' && (
                <div className="space-y-1">
                  {onlineFriends.length === 0 ? (
                    <p className="p-4 text-text-muted text-sm">No friends online</p>
                  ) : (
                    onlineFriends.map((f) => (
                      <UserCard
                        key={f.id}
                        user={{ id: f.id, username: f.username, avatar: f.avatar, status: f.status }}
                        relationship="friend"
                        currentUserId={user?.id ?? ''}
                        onClick={() => openUserProfile(f.id)}
                        onRemoveFriend={handleRemoveFriend}
                        onBlock={handleBlock}
                        onMessage={handleMessage}
                        canMessage
                      />
                    ))
                  )}
                </div>
              )}
              {activeTab === 'incoming' && (
                <div className="space-y-1">
                  {incoming.length === 0 ? (
                    <p className="p-4 text-text-muted text-sm">No incoming requests</p>
                  ) : (
                    incoming.map((r) => (
                      <UserCard
                        key={r.id}
                        user={{
                          id: r.fromUserId,
                          username: r.fromUser?.name ?? 'Unknown',
                          avatar: r.fromUser?.avatarUrl ?? null,
                        }}
                        relationship="pending_incoming"
                        requestId={r.id}
                        currentUserId={user?.id ?? ''}
                        onClick={() => openUserProfile(r.fromUserId)}
                        onAccept={handleAccept}
                        onDecline={handleDecline}
                        onBlock={handleBlock}
                      />
                    ))
                  )}
                </div>
              )}
              {activeTab === 'outgoing' && (
                <div className="space-y-1">
                  {outgoing.length === 0 ? (
                    <p className="p-4 text-text-muted text-sm">No outgoing requests</p>
                  ) : (
                    outgoing.map((r) => (
                      <UserCard
                        key={r.id}
                        user={{
                          id: r.toUserId,
                          username: r.toUser?.name ?? 'Unknown',
                          avatar: r.toUser?.avatarUrl ?? null,
                        }}
                        relationship="pending_outgoing"
                        requestId={r.id}
                        currentUserId={user?.id ?? ''}
                        onClick={() => openUserProfile(r.toUserId)}
                        onCancel={handleCancel}
                        onBlock={handleBlock}
                      />
                    ))
                  )}
                </div>
              )}
              {activeTab === 'blocked' && (
                <div className="space-y-1">
                  {blocks.length === 0 ? (
                    <p className="p-4 text-text-muted text-sm">No blocked users</p>
                  ) : (
                    blocks.map((b) => (
                      <UserCard
                        key={b.id}
                        user={{
                          id: b.id,
                          username: b.user?.name ?? 'Unknown',
                          avatar: b.user?.avatarUrl ?? null,
                        }}
                        relationship="blocked"
                        currentUserId={user?.id ?? ''}
                        onClick={() => openUserProfile(b.id)}
                        onUnblock={handleUnblock}
                      />
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-2 border-t border-border-primary">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => router.push(buildAppUrl({ tab: 'dms' }))}
          >
            Back to DMs
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center bg-bg-secondary border-l border-border-primary">
        <p className="text-text-muted text-sm">Select a friend to start a conversation</p>
      </div>

      <UserSettingsModal
        isOpen={isUserSettingsOpen}
        onClose={() => setIsUserSettingsOpen(false)}
      />
    </div>
  );
}
