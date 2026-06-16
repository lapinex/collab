'use client';

import { useState } from 'react';
import { Mic, MicOff, Headphones, PhoneOff, Settings, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useVoiceConnection } from '@/contexts/VoiceConnectionManager';
import { VoiceSettingsDialog } from '@/components/voice/VoiceSettingsDialog';

export function VoiceMiniPanel() {
  const {
    connectionState,
    currentChannelId,
    channelName,
    isMuted,
    isDeafened,
    isScreenSharing,
    toggleMute,
    toggleDeafen,
    toggleScreenShare,
    leaveChannel,
    getRoom,
    participants,
  } = useVoiceConnection();

  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const room = getRoom();
  const participantCount = participants.length;

  // Only show when connected or reconnecting
  const show =
    currentChannelId &&
    (connectionState === 'connected' || connectionState === 'reconnecting');
  if (!show) {
    return null;
  }

  const handleLeave = async () => {
    await leaveChannel();
  };

  return (
    <div className="px-2 py-2 bg-bg-quaternary border-t border-border-primary">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-text-primary truncate">
            {channelName || 'Voice Channel'}
          </div>
          <div className="text-xs text-text-muted">
            {participantCount} {participantCount === 1 ? 'participant' : 'participants'}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleLeave}
          className="h-7 w-7 text-text-secondary hover:text-danger hover:bg-danger/10"
          title="Leave voice channel"
        >
          <PhoneOff className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant={isMuted ? 'destructive' : 'outline'}
          size="icon"
          onClick={toggleMute}
          className="h-7 w-7"
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
        </Button>

        <Button
          variant={isDeafened ? 'destructive' : 'outline'}
          size="icon"
          onClick={toggleDeafen}
          className="h-7 w-7"
          title={isDeafened ? 'Undeafen' : 'Deafen'}
        >
          <Headphones className="w-3.5 h-3.5" />
        </Button>

        <Button
          variant={isScreenSharing ? 'destructive' : 'outline'}
          size="icon"
          onClick={toggleScreenShare}
          className="h-7 w-7"
          title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
        >
          <Monitor className="w-3.5 h-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-text-secondary"
          title="Voice Settings"
          onClick={() => setShowVoiceSettings(true)}
        >
          <Settings className="w-3.5 h-3.5" />
        </Button>
      </div>

      <VoiceSettingsDialog
        isOpen={showVoiceSettings}
        onClose={() => setShowVoiceSettings(false)}
        room={room}
        isConnected={connectionState === 'connected'}
      />
    </div>
  );
}
