'use client';

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import type { RemoteParticipant, RemoteVideoTrack } from 'livekit-client';

export interface VoiceParticipant {
  id: string; // participant.identity (unique per session)
  userId: string | null; // from metadata
  name: string;
  avatarUrl: string | null;
  isMuted: boolean;
  isSpeaking: boolean;
}

interface VoiceContextValue {
  // Current voice channel
  activeChannelId: string | null;
  channelName: string | null;
  
  // Participants for all channels
  participantsByChannel: Map<string, VoiceParticipant[]>;
  
  // Screen share
  screenTrack: { track: RemoteVideoTrack; owner: RemoteParticipant } | null;
  
  // Actions
  setActiveChannel: (channelId: string | null, channelName: string | null) => void;
  updateParticipants: (channelId: string, participants: VoiceParticipant[]) => void;
  setScreenShare: (channelId: string, track: RemoteVideoTrack | null, owner: RemoteParticipant | null) => void;
  getParticipants: (channelId: string) => VoiceParticipant[];
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

export function VoiceProvider({ children }: { children: ReactNode }) {
  const [activeChannelId, setActiveChannelIdState] = useState<string | null>(null);
  const [channelName, setChannelNameState] = useState<string | null>(null);
  const participantsByChannelRef = useRef<Map<string, VoiceParticipant[]>>(new Map());
  const [participantsByChannel, setParticipantsByChannel] = useState<Map<string, VoiceParticipant[]>>(new Map());
  const [screenTrack, setScreenTrackState] = useState<{ track: RemoteVideoTrack; owner: RemoteParticipant } | null>(null);
  const screenTrackChannelRef = useRef<string | null>(null);

  const setActiveChannel = useCallback((channelId: string | null, name: string | null) => {
    setActiveChannelIdState(channelId);
    setChannelNameState(name);
  }, []);

  const updateParticipants = useCallback((channelId: string, participants: VoiceParticipant[]) => {
    participantsByChannelRef.current.set(channelId, participants);
    setParticipantsByChannel(new Map(participantsByChannelRef.current));
  }, []);

  const setScreenShare = useCallback((channelId: string, track: RemoteVideoTrack | null, owner: RemoteParticipant | null) => {
    if (track && owner) {
      screenTrackChannelRef.current = channelId;
      setScreenTrackState({ track, owner });
    } else if (screenTrackChannelRef.current === channelId) {
      screenTrackChannelRef.current = null;
      setScreenTrackState(null);
    }
  }, []);

  const getParticipants = useCallback((channelId: string): VoiceParticipant[] => {
    return participantsByChannelRef.current.get(channelId) || [];
  }, []);

  return (
    <VoiceContext.Provider
      value={{
        activeChannelId,
        channelName,
        participantsByChannel,
        screenTrack,
        setActiveChannel,
        updateParticipants,
        setScreenShare,
        getParticipants,
      }}
    >
      {children}
    </VoiceContext.Provider>
  );
}

export function useVoiceContext() {
  const context = useContext(VoiceContext);
  if (!context) {
    throw new Error('useVoiceContext must be used within VoiceProvider');
  }
  return context;
}
