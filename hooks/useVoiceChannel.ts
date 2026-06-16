'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWebRTC } from './useWebRTC';
import { apiPost, apiGet } from '@/lib/api-client';
import { useAuth } from './useAuth';

interface VoiceParticipant {
  id: string;
  name: string;
  avatarUrl: string | null;
  isSpeaking?: boolean;
  isMuted?: boolean;
}

interface VoiceSession {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  joinedAt: string;
}

export function useVoiceChannel() {
  const { user } = useAuth();
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [isJoining, setIsJoining] = useState(false);
  
  const {
    isConnected: rtcConnected,
    isMuted,
    isDeafened,
    isJoining: rtcJoining,
    currentVoiceChannelId: rtcChannelId,
    error: rtcError,
    joinVoiceChannel: rtcJoin,
    leaveChannel: rtcLeave,
    toggleMute,
    toggleDeafen,
  } = useWebRTC({
    sfuUrl: '',
    apiKey: '',
    apiSecret: '',
  });

  const loadParticipants = useCallback(async (channelId: string) => {
    try {
      const response = await apiGet<{ participants: VoiceSession[] }>(
        `/api/voice/participants?channelId=${channelId}`
      );
      
      const participantsWithDetails: VoiceParticipant[] = (response.participants || []).map((session) => ({
        id: session.userId,
        name: session.userName,
        avatarUrl: session.avatarUrl,
        isSpeaking: false,
        isMuted: false,
      }));
      
      setParticipants(participantsWithDetails);
    } catch (error) {
      console.error('Failed to load participants:', error);
      setParticipants([]);
    }
  }, []);

  const leaveChannel = useCallback(async () => {
    if (!activeChannelId) return;

    const channelIdToLeave = activeChannelId;
    
    setActiveChannelId(null);
    setParticipants([]);

    try {
      await rtcLeave();
      await apiPost('/api/voice/leave', { channelId: channelIdToLeave });
    } catch (error) {
      console.error('Failed to leave voice channel:', error);
    }
  }, [activeChannelId, rtcLeave]);

  const joinChannel = useCallback(async (channelId: string) => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    if (isJoining || rtcJoining) {
      console.warn('Already joining a voice channel, ignoring duplicate request');
      return;
    }

    if (activeChannelId === channelId && rtcConnected) {
      return;
    }

    if (rtcChannelId === channelId && rtcConnected) {
      return;
    }

    if (activeChannelId && activeChannelId !== channelId) {
      await leaveChannel();
    }

    setIsJoining(true);

    try {
      await apiPost('/api/voice/join', { channelId });
      await rtcJoin(channelId, user.id, user.name);
      setActiveChannelId(channelId);
      await loadParticipants(channelId);
    } catch (error) {
      console.error('Failed to join voice channel:', error);
      try {
        await apiPost('/api/voice/leave', { channelId });
      } catch (cleanupError) {
        console.error('Failed to cleanup on join error:', cleanupError);
      }
      throw error;
    } finally {
      setIsJoining(false);
    }
  }, [user, isJoining, rtcJoining, activeChannelId, rtcChannelId, rtcConnected, rtcJoin, loadParticipants, leaveChannel]);

  useEffect(() => {
    if (!activeChannelId) return;
    
    // Load immediately on mount/channel change
    loadParticipants(activeChannelId);
    
    // Optimized: Poll only every 10 seconds (was 5s) to reduce DB load
    // Note: useParticipants also polls this endpoint, so total frequency may be ~5s
    const interval = setInterval(() => {
      loadParticipants(activeChannelId);
    }, 10000);

    return () => clearInterval(interval);
  }, [activeChannelId, loadParticipants]);

  useEffect(() => {
    if (activeChannelId && user) {
      setParticipants((prev) =>
        prev.map((p) =>
          p.id === user.id ? { ...p, isMuted } : p
        )
      );
    }
  }, [isMuted, activeChannelId, user]);

  return {
    activeChannelId,
    participants,
    isConnected: rtcConnected,
    isJoining: isJoining || rtcJoining,
    isMuted,
    isDeafened,
    error: rtcError,
    joinChannel,
    leaveChannel,
    toggleMute,
    toggleDeafen,
  };
}
