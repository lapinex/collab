'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Room, RemoteVideoTrack } from 'livekit-client';
import type { VoiceParticipant } from '@/lib/voice-view/keys';
import { getVoiceRuntime } from '@/lib/voice-runtime/voiceRuntime';
import { useVoiceSession } from '@/lib/voice-session/useVoiceSession';
import { useVoiceJoin, useVoiceLeave, useVoicePermissionsRealtime } from '@/hooks/voice';

/** Re-export for backward compatibility; same shape as VoiceParticipant from voice-view. */
export type { VoiceParticipant } from '@/lib/voice-view/keys';

interface VoiceConnectionManagerValue {
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
  currentChannelId: string | null;
  channelName: string | null;
  participants: VoiceParticipant[];
  isMuted: boolean;
  isDeafened: boolean;
  isScreenSharing: boolean;
  screenTrack: RemoteVideoTrack | import('livekit-client').LocalVideoTrack | null;
  screenOwner: import('livekit-client').RemoteParticipant | import('livekit-client').LocalParticipant | null;
  audioDevices: { input: MediaDeviceInfo[]; output: MediaDeviceInfo[] };
  selectedMicId: string | null;
  selectedSpeakerId: string | null;
  joinChannel: (channelId: string, channelName: string) => Promise<void>;
  leaveChannel: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  switchMic: (deviceId: string) => Promise<void>;
  switchSpeaker: (deviceId: string) => Promise<void>;
  getParticipantsForChannel: (channelId: string) => VoiceParticipant[];
  getRoom: () => Room | null;
  sendModeratorMute: (targetUserId: string) => void;
  sendModeratorDeafen: (targetUserId: string) => void;
}

function participantsFromSnapshot(
  order: string[],
  participants: Record<string, VoiceParticipant>
): VoiceParticipant[] {
  return order
    .map((id) => participants[id])
    .filter((p): p is VoiceParticipant => p != null);
}

/**
 * Standalone hook: state from useVoiceSession (runtime), actions from getVoiceRuntime().
 * No provider required; voice lives outside React.
 */
export function useVoiceConnection(): VoiceConnectionManagerValue {
  const snapshot = useVoiceSession();
  const { channelId, connectionState, order, participants, channelName, meta } = snapshot;

  useVoicePermissionsRealtime(channelId);

  const join = useVoiceJoin();
  const leave = useVoiceLeave();

  const [audioDevices, setAudioDevices] = useState<{
    input: MediaDeviceInfo[];
    output: MediaDeviceInfo[];
  }>({ input: [], output: [] });

  useEffect(() => {
    const load = async () => {
      try {
        const input = await Room.getLocalDevices('audioinput');
        const output = await Room.getLocalDevices('audiooutput');
        setAudioDevices({ input, output });
      } catch (e) {
        console.error('[VoiceConnectionManager] Failed to load audio devices:', e);
      }
    };
    load();
  }, []);

  const participantsList = useMemo(
    () => participantsFromSnapshot(order, participants),
    [order, participants]
  );

  const joinChannel = useCallback(
    async (cid: string, name: string) => {
      await join(cid, name, undefined);
    },
    [join]
  );

  const leaveChannel = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const rt = getVoiceRuntime().roomController;
    const currentRoom = rt.getCurrentChannelId();
    const { isDMRoom } = await import('@/lib/dm/DMSession');
    if (currentRoom && isDMRoom(currentRoom)) {
      const { getDMSession } = await import('@/lib/dm/DMSession');
      await getDMSession().endCall();
      return;
    }
    await rt.stopScreenShare();
    await leave();
  }, [leave]);

  const toggleMute = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const rt = getVoiceRuntime().roomController;
    if (!rt.getLocalAudioTrack()) return;
    const canSpeak = meta.canSpeak;
    const nextMuted = !meta.isMuted;
    if (!nextMuted && !canSpeak) return;
    rt.setMuted(nextMuted);
  }, [meta.isMuted, meta.canSpeak]);

  const toggleDeafen = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const rt = getVoiceRuntime().roomController;
    if (!rt.getLocalAudioTrack()) return;
    const newDeafen = !meta.isDeafened;
    rt.setMuted(newDeafen);
    getVoiceRuntime().voiceSession.setMeta({
      isDeafened: newDeafen,
      isMuted: newDeafen,
    });
  }, [meta.isDeafened]);

  const toggleScreenShare = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const rt = getVoiceRuntime().roomController;
    if (rt.getIsScreenSharing()) {
      await rt.stopScreenShare();
    } else {
      await rt.startScreenShare();
    }
  }, []);

  const switchMic = useCallback(async (deviceId: string) => {
    if (typeof window === 'undefined') return;
    await getVoiceRuntime().roomController.switchMic(deviceId);
  }, []);

  const switchSpeaker = useCallback(async (deviceId: string) => {
    if (typeof window === 'undefined') return;
    const room = getVoiceRuntime().roomController.getRoom();
    if (!room) return;
    await room.switchActiveDevice('audiooutput', deviceId);
    if (typeof localStorage !== 'undefined') localStorage.setItem('preferredSpeakerId', deviceId);
    getVoiceRuntime().voiceSession.setMeta({ speakerId: deviceId });
  }, []);

  const getParticipantsForChannel = useCallback(
    (cid: string): VoiceParticipant[] => {
      if (cid !== channelId) return [];
      return participantsFromSnapshot(order, participants);
    },
    [channelId, order, participants]
  );

  const getRoom = useCallback(() => getVoiceRuntime().roomController.getRoom(), []);

  const sendModeratorMute = useCallback((targetUserId: string) => {
    getVoiceRuntime().roomController.sendModeratorCommand('voice:mute-member', targetUserId);
  }, []);
  const sendModeratorDeafen = useCallback((targetUserId: string) => {
    getVoiceRuntime().roomController.sendModeratorCommand('voice:deafen-member', targetUserId);
  }, []);

  const getScreenTrack = useCallback(() => {
    try {
      if (typeof window === 'undefined') return null;
      return getVoiceRuntime().roomController.getScreenTrack();
    } catch {
      return null;
    }
  }, []);
  const getScreenOwner = useCallback(() => {
    try {
      if (typeof window === 'undefined') return null;
      return getVoiceRuntime().roomController.getScreenOwner();
    } catch {
      return null;
    }
  }, []);

  return useMemo<VoiceConnectionManagerValue>(
    () => ({
      connectionState,
      currentChannelId: channelId,
      channelName,
      participants: participantsList,
      isMuted: meta.isMuted,
      isDeafened: meta.isDeafened,
      isScreenSharing: meta.isScreenSharing,
      screenTrack: getScreenTrack(),
      screenOwner: getScreenOwner(),
      audioDevices,
      selectedMicId: meta.micId,
      selectedSpeakerId: meta.speakerId,
      joinChannel,
      leaveChannel,
      toggleMute,
      toggleDeafen,
      toggleScreenShare,
      switchMic,
      switchSpeaker,
      getParticipantsForChannel,
      getRoom,
      sendModeratorMute,
      sendModeratorDeafen,
    }),
    [
      connectionState,
      channelId,
      channelName,
      participantsList,
      meta.isMuted,
      meta.isDeafened,
      meta.isScreenSharing,
      meta.screenParticipantSid,
      meta.micId,
      meta.speakerId,
      audioDevices,
      joinChannel,
      leaveChannel,
      toggleMute,
      toggleDeafen,
      toggleScreenShare,
      switchMic,
      switchSpeaker,
      getParticipantsForChannel,
      getRoom,
      sendModeratorMute,
      sendModeratorDeafen,
      getScreenTrack,
      getScreenOwner,
    ]
  );
}
