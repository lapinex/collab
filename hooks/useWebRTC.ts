import { useState, useEffect, useCallback, useRef } from 'react';
import { WebRTCClient } from '@/lib/webrtc/client';

interface UseWebRTCOptions {
  sfuUrl: string;
  apiKey: string;
  apiSecret: string;
}

export function useWebRTC(_options: UseWebRTCOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [currentVoiceChannelId, setCurrentVoiceChannelId] = useState<string | null>(null);
  const clientRef = useRef<WebRTCClient | null>(null);

  useEffect(() => {
    clientRef.current = new WebRTCClient({
      signalingUrl: '/api/voice/signaling',
    });
    return () => {
      clientRef.current?.leaveChannel();
    };
  }, []);

  const joinVoiceChannel = useCallback(
    async (channelId: string, userId: string, userName: string) => {
      if (!clientRef.current) {
        setError(new Error('WebRTC client not initialized'));
        return;
      }

      // Guard: If already in this channel, do nothing
      if (currentVoiceChannelId === channelId && isConnected) {
        return;
      }

      // Guard: If already joining, do nothing
      if (isJoining) {
        return;
      }

      setIsJoining(true);
      try {
        await clientRef.current.joinVoiceChannel({
          channelId,
          userId,
          userName,
        });
        setIsConnected(true);
        setCurrentVoiceChannelId(channelId);
        setError(null);
      } catch (err) {
        setIsConnected(false);
        setCurrentVoiceChannelId(null);
        setError(err instanceof Error ? err : new Error('Failed to join voice channel'));
        throw err;
      } finally {
        setIsJoining(false);
      }
    },
    [isConnected, currentVoiceChannelId, isJoining]
  );

  const leaveChannel = useCallback(async () => {
    if (clientRef.current) {
      await clientRef.current.leaveChannel();
      setIsConnected(false);
      setCurrentVoiceChannelId(null);
      setIsMuted(false);
      setIsDeafened(false);
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (clientRef.current) {
      if (isMuted) {
        clientRef.current.unmute();
      } else {
        clientRef.current.mute();
      }
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  const toggleDeafen = useCallback(() => {
    if (clientRef.current) {
      if (isDeafened) {
        clientRef.current.undeafen();
      } else {
        clientRef.current.deafen();
      }
      setIsDeafened(!isDeafened);
    }
  }, [isDeafened]);

  return {
    isConnected,
    isMuted,
    isDeafened,
    isJoining,
    currentVoiceChannelId,
    error,
    joinVoiceChannel,
    leaveChannel,
    toggleMute,
    toggleDeafen,
    localStream: clientRef.current?.getLocalStream() || null,
    remoteStreams: clientRef.current?.getRemoteStreams() || [],
  };
}
