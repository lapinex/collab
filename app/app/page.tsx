'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAppStore } from '@/stores/app-store';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/auth-store';
import {
  selectPresenceStatus,
  selectUpdatePresence,
} from '@/stores/auth.selectors';
import {
  selectActiveTab,
  selectSelectedChannelId,
  selectSelectedDMChannelId,
  selectSelectedServerId,
  selectSetActiveTab,
  selectSetSelectedChannel,
  selectSetSelectedDMChannelId,
  selectSetSelectedServer,
} from '@/stores/app.selectors';
import { useNotificationsStore } from '@/stores/notifications-store';
import { getNotificationPermission, showDesktopNotification } from '@/lib/notifications/desktopNotificationService';
import { getNotificationUrl } from '@/lib/notifications/resolveNotificationTarget';
import type { NotificationDto } from '@/types/notifications';
import { useServerViewCacheSafety } from '@/hooks/useServerViewCacheSafety';
import { useServerViewDomainRealtime } from '@/hooks/useServerViewDomainRealtime';
import { useServerViewSlices } from '@/hooks/useServerViewSlices';
import { scheduleRefetchServerViewSlices } from '@/hooks/useServerViewQuery';
import { useServers } from '@/hooks/useServers';
import { useChannels } from '@/hooks/useChannels';
// import { useVoiceChannel } from '@/hooks/useVoiceChannel'; // Not needed for LiveKit
import { ServerList } from '@/components/server/ServerList';
import { JoinCreateServerModal } from '@/components/modals/JoinCreateServerModal';
import { ChannelList } from '@/components/channel/ChannelList';
import { DMList } from '@/components/dm/DMList';
import dynamic from 'next/dynamic';
import { VoiceMiniPanel } from '@/components/voice/VoiceMiniPanel';
import { PersistentVoiceLayer, VOICE_UI_SLOT_ID } from '@/components/voice/PersistentVoiceLayer';
import { LiveKitVoiceChannel } from '@/components/voice/LiveKitVoiceChannel';

// Lazy load heavy components
const ChatWindow = dynamic(() => import('@/components/chat/ChatWindow').then(mod => ({ default: mod.ChatWindow })), { 
  ssr: false,
  loading: () => <div className="flex-1 flex items-center justify-center text-text-muted">Loading chat...</div>
});

const ParticipantList = dynamic(() => import('@/components/participants/ParticipantList').then(mod => ({ default: mod.ParticipantList })), { 
  ssr: false 
});

// Lazy modals — load only when opened (Phase 4 perf)
const EditProfileModal = dynamic(
  () => import('@/components/profile/EditProfileModal').then(m => ({ default: m.EditProfileModal })),
  { ssr: false }
);
const CreateChannelModal = dynamic(
  () => import('@/components/channel/CreateChannelModal').then(m => ({ default: m.CreateChannelModal })),
  { ssr: false }
);
const UserSettingsModal = dynamic(
  () => import('@/components/settings/UserSettingsModal').then(m => ({ default: m.UserSettingsModal })),
  { ssr: false }
);
const DMIncomingCallOverlay = dynamic(
  () => import('@/components/dm/DMIncomingCallOverlay').then(m => ({ default: m.DMIncomingCallOverlay })),
  { ssr: false }
);

import { Avatar } from '@/components/profile/Avatar';
import { useUserProfileContext } from '@/contexts/UserProfileContext';
import { SelectedVoiceChannelProvider } from '@/contexts/SelectedVoiceChannelContext';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Channel } from '@/types/server';
import { useDMSession } from '@/hooks/useDMSession';
import { useServerMembers } from '@/hooks/serverView';
import { useServerPermissions } from '@/hooks/useServerPermissions';
import { useVoiceConnection } from '@/contexts/VoiceConnectionManager';
import { useSyncVoiceSessionToPresence } from '@/hooks/useSyncVoiceSessionToPresence';
import { usePresence } from '@/hooks/usePresence';
import { usePresenceOnlineSync } from '@/hooks/usePresenceOnlineSync';
import { usePresenceStore } from '@/stores/presence-store';
import { selectPresenceStatusByUserId } from '@/stores/presence.selectors';
import { useVoicePresence } from '@/hooks/useVoicePresence';
import { useVoiceModerationRealtime } from '@/hooks/useVoiceModerationRealtime';
import { useBadges } from '@/hooks/useBadges';
import { getRealtimeManager } from '@/lib/realtime/RealtimeManager';
import { NotificationBell, useUnreadNotifications } from '@/components/notifications/NotificationBell';
import { ConnectionStatus } from '@/components/ui/ConnectionStatus';
import { useSyncAppStateWithURL } from '@/hooks/useSyncAppStateWithURL';
import { useNavigationSend } from '@/lib/ui-orchestrator/NavigationMachineContext';
import { useBreakpointShell } from '@/hooks/useBreakpointShell';

const STATUS_LABELS: Record<string, string> = { online: 'Online', idle: 'Idle', dnd: 'Do Not Disturb', offline: 'Offline' };
const STATUS_CLASSES: Record<string, string> = { online: 'text-green-primary', idle: 'text-yellow-500', dnd: 'text-red-500', offline: 'text-text-muted' };
const selectOfflinePresenceStatus = () => 'offline' as const;

function UserPanelAvatar({ user }: { user: { id: string; name: string; avatarUrl: string | null } | null }) {
  const userId = user?.id ?? null;
  const statusSelector = useMemo(
    () => (userId ? selectPresenceStatusByUserId(userId) : selectOfflinePresenceStatus),
    [userId]
  );
  const status = usePresenceStore(statusSelector) as 'online' | 'idle' | 'dnd' | 'offline';
  const displayStatus = userId && status === 'offline' ? 'online' : status;
  return (
    <Avatar
      src={user?.avatarUrl}
      name={user?.name || 'User'}
      size="sm"
      status={displayStatus}
      showStatus
    />
  );
}

function UserPanelStatus({ userId }: { userId: string | null }) {
  const statusSelector = useMemo(
    () => (userId ? selectPresenceStatusByUserId(userId) : selectOfflinePresenceStatus),
    [userId]
  );
  const status = usePresenceStore(statusSelector);
  const displayStatus = userId && status === 'offline' ? 'online' : status;
  const label = STATUS_LABELS[displayStatus] ?? 'Offline';
  const className = STATUS_CLASSES[displayStatus] ?? 'text-text-muted';
  return <div className={cn('text-xs', className)}>{label}</div>;
}

async function markChannelRead(channelId: string, serverId?: string) {
  const res = await fetch('/api/notifications/mark-channel-read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ channelId, serverId: serverId ?? undefined }),
  });
  if (!res.ok) console.error('[mark-channel-read] failed:', await res.text());
}

export default function AppPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlSearchParams = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);
  const { user, logout } = useAuth();
  const selectedServerId = useAppStore(selectSelectedServerId);
  const selectedChannelId = useAppStore(selectSelectedChannelId);
  const activeTab = useAppStore(selectActiveTab);
  const storeDMChannelId = useAppStore(selectSelectedDMChannelId);
  const setSelectedServer = useAppStore(selectSetSelectedServer);
  const setSelectedChannel = useAppStore(selectSetSelectedChannel);
  const setActiveTab = useAppStore(selectSetActiveTab);
  const setSelectedDMChannelId = useAppStore(selectSetSelectedDMChannelId);
  const updateAuthPresence = useAuthStore(selectUpdatePresence);
  const { servers, isLoading: isLoadingServers, invalidateServers } = useServers();
  const { channels, isLoading: isLoadingChannels, invalidateChannels } = useChannels(selectedServerId);

  useServerViewSlices(selectedServerId);
  useServerViewDomainRealtime(selectedServerId);
  useServerViewCacheSafety(selectedServerId);

  const { data: serverMembersData } = useServerMembers(selectedServerId ?? null);
  const { permissions: serverPerms } = useServerPermissions(selectedServerId ?? null);
  const participantsForList = useMemo(() => {
    if (!selectedServerId || !selectedChannelId) return null;
    const members = serverMembersData ?? [];
    return members.map((m) => ({
      id: m.id,
      username: m.nickname || m.name,
      avatar: m.avatarUrl,
      roleColor: m.roles?.[0]?.color ?? null,
      roleName: m.roles?.[0]?.name ?? null,
    }));
  }, [selectedServerId, selectedChannelId, serverMembersData]);

  // DM: single source of truth from DMSession (no local message state); store sync for ToastOverlay
  const [dmSearchQuery, setDmSearchQuery] = useState('');
  const [dmSearchResults, setDmSearchResults] = useState<{ id: string; name: string; avatarUrl: string | null }[]>([]);
  const dmSession = useDMSession(user?.id ?? null);
  const {
    channels: dmChannels,
    activeDmId: dmSessionActiveDmId,
    setActiveDm,
    createOrGetChannel,
    startCall,
    acceptCall,
    rejectCall,
    incomingCall,
  } = dmSession;
  const selectedDMChannelId = storeDMChannelId;
  const isLoadingDMs = !!user?.id && dmChannels.length === 0;

  const urlSyncInitialized = useSyncAppStateWithURL({
    searchParams: urlSearchParams,
    router,
    activeTab,
    selectedServerId,
    selectedChannelId,
    selectedDMChannelId,
    setActiveTab,
    setSelectedServer,
    setSelectedChannel,
    setSelectedDMChannelId,
  });

  const voiceConnection = useVoiceConnection();
  const { currentChannelId: activeVoiceChannelIdFromManager, leaveChannel, connectionState } = voiceConnection;
  const send = useNavigationSend();

  // Store → DMSession: navigation store is source of truth; DMSession follows for call subscriptions
  useEffect(() => {
    if (activeTab === 'servers') {
      if (dmSessionActiveDmId != null) setActiveDm(null);
    } else if (activeTab === 'dms') {
      if (storeDMChannelId != null && dmSessionActiveDmId !== storeDMChannelId) {
        setActiveDm(storeDMChannelId);
      } else if (storeDMChannelId == null && dmSessionActiveDmId != null) {
        setActiveDm(null);
      }
    }
  }, [activeTab, storeDMChannelId, dmSessionActiveDmId, setActiveDm]);

  // Badges: server/channel/DM unread + mentions (source of truth from API)
  const serverIds = useMemo(() => servers.map((s) => s.id), [servers]);
  const channelIds = useMemo(() => channels.map((c) => c.id), [channels]);
  const dmIds = useMemo(() => dmChannels.map((d) => d.id), [dmChannels]);
  const { fetchBadges } = useBadges(serverIds, channelIds, dmIds);
  const { notifications: unreadNotifications, unreadCount, fetchUnread: fetchUnreadNotifications } = useUnreadNotifications(user?.id ?? null);

  useEffect(() => {
    fetchBadges();
  }, [fetchBadges]);

  useEffect(() => {
    if (!user?.id) return;
    return getRealtimeManager().subscribeToBroadcast(
      `user:${user.id}`,
      'notification:new',
      (payload: unknown) => {
        const p = payload as { id?: string; type?: string; channelId?: string | null; readAt?: string | null; createdAt?: string; userId?: string; messageId?: string | null; serverId?: string | null; dmId?: string | null; payload?: unknown };
        if (p?.id) {
          useNotificationsStore.getState().addNotification({
            id: p.id,
            type: p.type ?? 'system',
            userId: p.userId ?? user.id,
            messageId: p.messageId ?? null,
            channelId: p.channelId ?? null,
            serverId: p.serverId ?? null,
            dmId: p.dmId ?? null,
            readAt: p.readAt ?? null,
            createdAt: p.createdAt ?? new Date().toISOString(),
            payload: (p.payload ?? null) as NotificationDto['payload'],
          });
        }
        if (p?.type === 'dm' && (p?.channelId || (p?.payload as Record<string, unknown>)?.dmId)) {
          dmSession.refreshChannelsIfNeeded((p.channelId ?? (p.payload as Record<string, unknown>)?.dmId) as string);
        }
        fetchBadges();
        fetchUnreadNotifications();
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
          if (getNotificationPermission() === 'granted') {
            showDesktopNotification({
              notification: payload as NotificationDto,
              onClick: (n) => {
                window.location.href = getNotificationUrl(n);
              },
            });
          }
        }
      }
    );
  }, [user?.id, fetchBadges, fetchUnreadNotifications, dmSession]);

  useEffect(() => {
    if (!user?.id) return;
    const topic = `user:${user.id}`;
    const refreshServerSlices = (payload: unknown) => {
      const p = payload as { serverId?: string };
      invalidateServers();
      if (p?.serverId && selectedServerId === p.serverId) {
        scheduleRefetchServerViewSlices(queryClient, p.serverId);
        invalidateChannels();
      }
    };
    const unsubJoined = getRealtimeManager().subscribeToBroadcast(topic, 'server:member_joined', refreshServerSlices);
    const unsubRemoved = getRealtimeManager().subscribeToBroadcast(topic, 'server:member_removed', refreshServerSlices);
    const unsubKicked = getRealtimeManager().subscribeToBroadcast(topic, 'server:kicked', refreshServerSlices);
    const unsubBanned = getRealtimeManager().subscribeToBroadcast(topic, 'server:banned', refreshServerSlices);
    return () => {
      unsubJoined();
      unsubRemoved();
      unsubKicked();
      unsubBanned();
    };
  }, [user?.id, selectedServerId, queryClient, invalidateServers, invalidateChannels]);

  const handleNavigateToChannel = useCallback(
    (channelId: string, isDM: boolean, serverId?: string | null) => {
      if (isDM) send({ type: 'DM_SELECTED', dmId: channelId });
      else send({ type: 'CHANNEL_SELECTED', channelId, serverId: serverId ?? undefined });
    },
    [send]
  );

  const handleSelectChannel = useCallback(
    (channelId: string) => {
      send({ type: 'CHANNEL_SELECTED', channelId });
      if (selectedServerId) {
        markChannelRead(channelId, selectedServerId).then(() => fetchBadges());
      }
    },
    [selectedServerId, send, fetchBadges]
  );

  const handleSelectDMChannel = useCallback(
    (channelId: string) => {
      send({ type: 'DM_SELECTED', dmId: channelId });
      markChannelRead(channelId).then(() => fetchBadges());
    },
    [send, fetchBadges]
  );


  // User search for DM: debounced fetch
  useEffect(() => {
    if (!dmSearchQuery.trim()) {
      setDmSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/users/search?q=${encodeURIComponent(dmSearchQuery.trim())}`,
          { credentials: 'include' }
        );
        if (!res.ok) return;
        const data = await res.json();
        setDmSearchResults(data.users ?? []);
      } catch {
        setDmSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [dmSearchQuery]);

  useSyncVoiceSessionToPresence();
  usePresenceOnlineSync(selectedServerId ?? undefined);
  usePresence(); // fetch current user presence + heartbeat so left panel status is correct
  // LiveKit handles voice channels directly, no need for useVoiceChannel hook

  // Auto-switch to text channel when leaving voice channel (via state machine)
  useEffect(() => {
    if (connectionState === 'disconnected' && selectedChannelId && selectedServerId) {
      const currentChannel = channels.find((ch) => ch.id === selectedChannelId);
      if (currentChannel?.type === 'voice') {
        const textChannel = channels.find((ch) => ch.type === 'text');
        if (textChannel) {
          send({ type: 'VOICE_LEFT', textChannelId: textChannel.id });
        }
      }
    }
  }, [connectionState, selectedChannelId, selectedServerId, channels, send]);

  const { openUserProfile } = useUserProfileContext();
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [userStatus, setUserStatus] = useState<'online' | 'idle' | 'dnd' | 'offline'>('online');
  const [userBio] = useState<string | null>(null);
  const presenceStatus = useAuthStore(selectPresenceStatus);

  // Create channel modal state
  const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false);
  // User settings modal state
  const [isUserSettingsOpen, setIsUserSettingsOpen] = useState(false);
  // Welcome empty state: open Join/Create server modal in a specific mode
  const [welcomeModalMode, setWelcomeModalMode] = useState<'select' | 'join' | 'create' | false>(false);
  // Closing state: keep modal mounted until exit animation finishes
  const [editProfileClosing, setEditProfileClosing] = useState(false);
  const [createChannelClosing, setCreateChannelClosing] = useState(false);
  const [userSettingsClosing, setUserSettingsClosing] = useState(false);

  // Load user presence status (only on initial load)
  useEffect(() => {
    if (!user?.id) return;

    const loadPresence = async () => {
      try {
        const response = await fetch('/api/presence', {
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          if (data.presence?.status) {
            const status = data.presence.status;
            // Map API presence status to UI status
            // 'away' -> 'idle', 'invisible' -> 'offline'
            const mappedStatus = status === 'away' 
              ? 'idle' 
              : status === 'invisible' 
              ? 'offline' 
              : status;
            
            // Type guard to ensure mappedStatus is valid
            if (mappedStatus === 'online' || mappedStatus === 'idle' || mappedStatus === 'dnd' || mappedStatus === 'offline') {
              setUserStatus(mappedStatus);
            }
            
            // Also update auth-store (with original status)
            updateAuthPresence(status);
          }
        }
      } catch (err) {
        console.error('Failed to load presence:', err);
      }
    };

    loadPresence();
  }, [user?.id, updateAuthPresence]);

  // Sync userStatus with auth-store presenceStatus
  useEffect(() => {
    if (presenceStatus && presenceStatus !== userStatus) {
      // Map auth-store presence status to UI status
      // 'away' -> 'idle', 'invisible' -> 'offline'
      const mappedStatus = presenceStatus === 'away' 
        ? 'idle' 
        : presenceStatus === 'invisible' 
        ? 'offline' 
        : presenceStatus;
      
      // Type guard to ensure mappedStatus is valid
      if (mappedStatus === 'online' || mappedStatus === 'idle' || mappedStatus === 'dnd' || mappedStatus === 'offline') {
        setUserStatus(mappedStatus);
      }
    }
  }, [presenceStatus, userStatus]);

  // Auto-select first server and channel (bootstrap)
  useEffect(() => {
    if (!urlSyncInitialized) return;
    if (!selectedServerId && servers.length > 0 && servers[0]) {
      send({ type: 'SERVER_SELECTED', serverId: servers[0].id });
    }
  }, [urlSyncInitialized, servers, selectedServerId, send]);

  useEffect(() => {
    if (!urlSyncInitialized) return;
    if (selectedServerId && channels.length > 0 && !selectedChannelId) {
      const textChannel = channels.find((ch) => ch.type === 'text');
      if (textChannel) {
        send({ type: 'CHANNEL_SELECTED', channelId: textChannel.id, serverId: selectedServerId });
      }
    }
  }, [urlSyncInitialized, channels, selectedServerId, selectedChannelId, send]);

  const handleAvatarClick = (userId: string, anchor?: import('@/contexts/UserProfileContext').ProfileAnchor) => {
    openUserProfile(userId, selectedServerId ?? undefined, anchor);
  };

  useEffect(() => {
    const handler = () => setIsUserSettingsOpen(true);
    window.addEventListener('open-user-settings', handler);
    return () => window.removeEventListener('open-user-settings', handler);
  }, []);

  const handleProfileUpdated = () => {
    // Profile is now updated optimistically in EditProfileModal via authStore
    // No need to refetch - store already has the latest data
    // This callback is kept for compatibility but does nothing
  };

  const handleChannelCreated = (_channel: Channel) => {
    if (selectedServerId) {
      invalidateChannels();
    }
  };

  const selectedServer = servers.find((s) => s.id === selectedServerId);
  const selectedChannel = channels.find((ch) => ch.id === selectedChannelId);
  const isVoiceChannel = selectedChannel?.type === 'voice';
  // For LiveKit, show voice UI when voice channel is selected
  const isInVoiceChannel = isVoiceChannel && selectedChannelId;
  // Get active voice channel from VoiceConnectionManager
  const activeVoiceChannelId = activeVoiceChannelIdFromManager;

  const voiceChannelIdForPresence = isVoiceChannel ? selectedChannelId : null;
  const { participants: voicePresenceParticipants } = useVoicePresence(voiceChannelIdForPresence);
  useVoiceModerationRealtime(activeVoiceChannelId ?? null);

  // For LiveKit: voice channels are handled by selection, no separate join needed

  const handleLeaveVoice = async () => {
    await leaveChannel();
    if (selectedServerId) {
      const textChannel = channels.find((ch) => ch.type === 'text');
      if (textChannel) {
        send({ type: 'VOICE_LEFT', textChannelId: textChannel.id });
      }
    }
  };

  const selectedVoiceForLayer =
    isInVoiceChannel && selectedChannelId && selectedChannel
      ? { channelId: selectedChannelId, channelName: selectedChannel.name }
      : null;

  const shell = useBreakpointShell();

  return (
    <SelectedVoiceChannelProvider value={selectedVoiceForLayer}>
    <div className="flex h-screen bg-bg-primary" data-shell={shell}>
      {/* Voice UI: shows as soon as voice channel is selected (no black screen) */}
      <PersistentVoiceLayer />
      {/* Left column: Server list */}
      <div className="w-[72px] flex-shrink-0 bg-bg-primary border-r border-border-primary">
        <ServerList
          servers={servers}
          selectedServerId={selectedServerId || undefined}
          onSelectServer={(id) => send({ type: 'SERVER_SELECTED', serverId: id })}
          onServerCreated={(server) => {
            invalidateServers();
            send({ type: 'SERVER_SELECTED', serverId: server.id });
          }}
          onServerJoined={(server) => {
            invalidateServers();
            send({ type: 'SERVER_SELECTED', serverId: server.id });
          }}
          onUserSettingsClick={() => setIsUserSettingsOpen(true)}
        />
      </div>

      {/* Channel sidebar — отдельный фон и полоска-разделитель от списка серверов */}
      <div className="w-60 flex-shrink-0 flex flex-col bg-bg-tertiary border-l-2 border-border-primary border-r border-border-primary">
        {/* Tabs */}
        <div className="px-2 pt-2 border-b border-border-primary">
          <Tabs value={activeTab} onValueChange={(value) => send({ type: 'TAB_SWITCHED', tab: value as 'servers' | 'dms' })}>
            <TabsList className="w-full">
              <TabsTrigger value="servers" className="flex-1">Servers</TabsTrigger>
              <TabsTrigger value="dms" className="flex-1">DMs</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Friends button - only when DMs tab is active */}
        {activeTab === 'dms' && (
          <div className="px-2 py-2 border-b border-border-primary">
            <Button
              variant="outline"
              className="w-full justify-start rounded-md"
              onClick={() => router.push('/app/friends')}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mr-2 flex-shrink-0"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Friends
            </Button>
          </div>
        )}

        {/* Content based on active tab */}
        {activeTab === 'servers' ? (
          <>
            {/* Server header */}
            <div className="h-12 px-4 flex items-center justify-between border-b border-border-primary shadow-sm">
              <h2 className="font-semibold text-text-primary truncate flex-1">
                {selectedServer?.name || 'Select a server'}
              </h2>
              {selectedServer && user && selectedServer.ownerId === user.id && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => router.push(`/app/servers/${selectedServer.id}/settings`)}
                  className="text-text-secondary hover:text-text-primary flex-shrink-0"
                  title="Server Settings"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 1v6m0 6v6m9-9h-6m-6 0H3" />
                  </svg>
                </Button>
              )}
            </div>

            {/* Channel list */}
            <div className="flex-1 overflow-y-auto">
              {isLoadingChannels ? (
                <div className="p-4">
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-8 bg-bg-quaternary rounded animate-pulse" />
                    ))}
                  </div>
                </div>
              ) : (
                <ChannelList
                  channels={channels}
                  selectedChannelId={selectedChannelId || undefined}
                  onSelectChannel={handleSelectChannel}
                  onJoinVoice={(channelId) => {
                    const { currentChannelId, joinChannel, connectionState } = voiceConnection;
                    const channel = channels.find((ch) => ch.id === channelId);
                    if (!channel) return;

                    if (currentChannelId === channelId && connectionState === 'connected') {
                      send({ type: 'CHANNEL_SELECTED', channelId });
                      return;
                    }
                    if (connectionState === 'connecting') return;

                    send({ type: 'CHANNEL_SELECTED', channelId });
                    void joinChannel(channelId, channel.name).catch((error) => {
                      console.error('[AppPage] Failed to join voice channel:', error);
                    });
                  }}
                  onLeaveVoice={handleLeaveVoice}
                  activeVoiceChannelId={activeVoiceChannelId || undefined}
                  isVoiceJoining={false}
                  onCreateChannel={() => setIsCreateChannelOpen(true)}
                  serverId={selectedServerId ?? undefined}
                  currentUserId={user?.id}
                  canMuteMembers={serverPerms.canMuteMembers}
                  canDeafenMembers={serverPerms.canDeafenMembers}
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
            {/* User search for new DM */}
            <div className="p-2 border-b border-border-primary flex-shrink-0">
              <input
                type="search"
                placeholder="Search users..."
                value={dmSearchQuery}
                onChange={(e) => setDmSearchQuery(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-bg-quaternary border border-border-primary text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-primary"
                aria-label="Search users to start DM"
              />
              {dmSearchResults.length > 0 && (
                <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto" role="listbox">
                  {dmSearchResults.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={async () => {
                          const ch = await createOrGetChannel(u.id);
                          send({ type: 'DM_SELECTED', dmId: ch.id });
                          setDmSearchQuery('');
                          setDmSearchResults([]);
                        }}
                        className="w-full px-3 py-2 flex items-center gap-2 rounded hover:bg-bg-hover text-left"
                        role="option"
                        aria-selected={false}
                      >
                        <Avatar src={u.avatarUrl} name={u.name} size="sm" showStatus={false} />
                        <span className="text-sm text-text-primary truncate">{u.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {isLoadingDMs ? (
              <div className="p-4">
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 bg-bg-quaternary rounded animate-pulse" />
                  ))}
                </div>
              </div>
            ) : (
              <DMList
                channels={dmChannels}
                selectedChannelId={selectedDMChannelId ?? undefined}
                onSelectChannel={handleSelectDMChannel}
                onUserClick={openUserProfile}
                isLoading={isLoadingDMs}
              />
            )}
          </div>
        )}

        {/* Voice Mini Panel - only shows when in voice channel */}
        <VoiceMiniPanel />

        {/* User panel at bottom — статус слева от настроек, зависит от выбранного */}
        <div className="px-2 py-2 flex flex-col gap-2 bg-bg-quaternary border-t border-border-primary">
          <ConnectionStatus />
          <div className="flex items-center gap-2">
            <div
              className="cursor-pointer"
              onClick={(e) => {
                if (!user) return;
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                handleAvatarClick(user.id, { x: rect.left, y: rect.top + rect.height / 2, side: 'left' });
              }}
            >
              <UserPanelAvatar user={user} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-text-primary truncate">
                {user?.name}
              </div>
              <UserPanelStatus userId={user?.id ?? null} />
            </div>
            <NotificationBell
              unreadCount={unreadCount}
              notifications={unreadNotifications}
              onRefresh={fetchUnreadNotifications}
              onNavigate={handleNavigateToChannel}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              className="text-text-secondary hover:text-danger"
              title="Logout"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsEditProfileOpen(true)}
              className="text-text-secondary hover:text-text-primary"
              title="User Settings"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v6m0 6v6m9-9h-6m-6 0H3" />
              </svg>
            </Button>
          </div>
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-bg-secondary">
        {activeTab === 'dms' && selectedDMChannelId ? (
          (() => {
            const dmChannel = dmChannels.find((ch) => ch.id === selectedDMChannelId);
            return (
              <>
                <div className={cn(
                  'h-12 px-4 flex items-center gap-3 flex-shrink-0',
                  'bg-gradient-to-b from-bg-tertiary to-bg-secondary',
                  'border-b border-border-primary shadow-sm',
                )}>
                  <Avatar
                    src={dmChannel?.otherUser.avatarUrl}
                    name={dmChannel?.otherUser.name || 'User'}
                    size="sm"
                    status="online"
                    showStatus
                  />
                  <h3 className="font-semibold text-text-primary flex-1 min-w-0 truncate">
                    {dmChannel?.otherUser.name || 'Direct Message'}
                  </h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => startCall(selectedDMChannelId)}
                    disabled={dmSession.callState !== 'idle'}
                    className={dmSession.callState !== 'idle' ? 'opacity-50 cursor-not-allowed text-text-muted' : 'text-text-secondary hover:text-text-primary'}
                    title={dmSession.callState !== 'idle' ? 'Call in progress' : 'Start call'}
                    aria-label="Start call"
                  >
                    <span className="text-lg" aria-hidden>📞</span>
                  </Button>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                  {dmChannel ? (
                    <ChatWindow
                      type="dm"
                      channelId={selectedDMChannelId}
                      channelName={dmChannel.otherUser.name || 'Direct Message'}
                      currentUserId={user?.id}
                      currentUser={user ? { id: user.id, name: user.name, avatarUrl: user.avatarUrl ?? null } : undefined}
                      dmChannel={dmChannel}
                      onAvatarClick={handleAvatarClick}
                      placeholder="Message..."
                      showHeader={false}
                      className="flex-1 flex flex-col min-w-0 min-h-0"
                    />
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-text-muted">Loading...</div>
                  )}
                </div>
              </>
            );
          })()
        ) : selectedServerId && selectedChannelId ? (
          isInVoiceChannel ? (
            /* Voice UI rendered inline so slot is never black; portal used only as fallback */
            <div id={VOICE_UI_SLOT_ID} className="flex-1 flex flex-col min-w-0 min-h-0 bg-bg-secondary">
              <LiveKitVoiceChannel
                channelId={selectedChannelId}
                channelName={selectedChannel?.name ?? 'Voice Channel'}
                currentUserId={user?.id ?? ''}
                serverId={selectedServerId ?? undefined}
              />
            </div>
          ) : (
            <ChatWindow
              type="server"
              channelId={selectedChannelId}
              channelName={selectedChannel?.name ?? 'Channel'}
              currentUserId={user?.id}
              currentUser={user ? { id: user.id, name: user.name, avatarUrl: user.avatarUrl ?? null } : undefined}
              serverId={selectedServerId || undefined}
              onAvatarClick={handleAvatarClick}
              placeholder={`Message #${selectedChannel?.name ?? 'channel'}`}
              className="flex-1 flex flex-col min-w-0 min-h-0"
            />
          )
        ) : (
          <div className="flex-1 flex items-center justify-center">
            {isLoadingServers ? (
              <div className="text-text-muted">Loading...</div>
            ) : servers.length === 0 ? (
              <div className="text-center">
                <div className="text-6xl mb-4">🚀</div>
                <h2 className="text-xl font-semibold text-text-primary mb-2">
                  Welcome to Collab
                </h2>
                <p className="text-text-secondary mb-4">
                  Create or join a server to get started
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Button
                    variant="default"
                    className="bg-green-primary hover:bg-green-primary/90 text-white"
                    onClick={() => setWelcomeModalMode('create')}
                  >
                    🎨 Create Server
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setWelcomeModalMode('join')}
                  >
                    🔗 Join Server
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <div className="text-6xl mb-4">💬</div>
                <h2 className="text-xl font-semibold text-text-primary mb-2">
                  Select a channel
                </h2>
                <p className="text-text-secondary">
                  Choose a channel from the sidebar to start chatting
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right column: Participants — only for server channels, not DMs */}
      {selectedChannelId && activeTab === 'servers' && (
        <ParticipantList
          participants={participantsForList}
          currentUserId={user?.id}
          serverId={selectedServerId ?? undefined}
          canManageRoles={serverPerms.canManageRoles}
          voiceChannelId={voiceChannelIdForPresence}
          activeVoiceChannelId={activeVoiceChannelId ?? undefined}
          canMuteMembers={serverPerms.canMuteMembers}
          canDeafenMembers={serverPerms.canDeafenMembers}
          voicePresence={voicePresenceParticipants}
        />
      )}

      {/* Edit Profile Modal — lazy + exit animation */}
      {user && (isEditProfileOpen || editProfileClosing) && (
        <EditProfileModal
          isOpen={isEditProfileOpen}
          onClose={() => {
            setIsEditProfileOpen(false);
            setEditProfileClosing(true);
          }}
          onClosed={() => setEditProfileClosing(false)}
          userId={user.id}
          currentName={user.name}
          currentAvatarUrl={user.avatarUrl}
          currentBio={userBio}
          currentEmail={user.email}
          currentStatus={userStatus}
          onProfileUpdated={handleProfileUpdated}
        />
      )}

      {/* Create Channel Modal — lazy + exit animation */}
      {selectedServerId && (isCreateChannelOpen || createChannelClosing) && (
        <CreateChannelModal
          isOpen={isCreateChannelOpen}
          onClose={() => {
            setIsCreateChannelOpen(false);
            setCreateChannelClosing(true);
          }}
          onClosed={() => setCreateChannelClosing(false)}
          serverId={selectedServerId}
          channels={channels}
          onChannelCreated={handleChannelCreated}
        />
      )}

      {/* Welcome empty state: Join/Create Server modal */}
      {welcomeModalMode !== false && (
        <JoinCreateServerModal
          isOpen={true}
          initialMode={welcomeModalMode}
          onClose={() => setWelcomeModalMode(false)}
          onServerCreated={(server) => {
            invalidateServers();
            send({ type: 'SERVER_SELECTED', serverId: server.id });
            setWelcomeModalMode(false);
          }}
          onServerJoined={(server) => {
            invalidateServers();
            send({ type: 'SERVER_SELECTED', serverId: server.id });
            setWelcomeModalMode(false);
          }}
        />
      )}

      {/* User Settings Modal — lazy + exit animation */}
      {(isUserSettingsOpen || userSettingsClosing) && (
        <UserSettingsModal
          isOpen={isUserSettingsOpen}
          onClose={() => {
            setIsUserSettingsOpen(false);
            setUserSettingsClosing(true);
          }}
          onClosed={() => setUserSettingsClosing(false)}
        />
      )}

      {/* DM incoming call overlay */}
      {incomingCall && (
        <DMIncomingCallOverlay
          incomingCall={incomingCall}
          onAccept={() => acceptCall()}
          onReject={() => rejectCall()}
        />
      )}

    </div>
    </SelectedVoiceChannelProvider>
  );
}
