'use client';

import { VoiceControls } from './VoiceControls';
import { VoiceParticipants } from './VoiceParticipants';

interface VoiceParticipant {
  id: string; // participant.identity (unique per session)
  userId?: string | null; // from metadata (for identifying current user)
  name: string; // from participant.name or metadata.nickname
  avatarUrl: string | null; // from metadata.avatar
  isSpeaking?: boolean;
  isMuted?: boolean;
}

interface VoiceChannelUIProps {
  channelName: string;
  participants: VoiceParticipant[];
  currentUserId?: string;
  isMuted: boolean;
  isDeafened: boolean;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onLeave: () => void;
  className?: string;
}

export function VoiceChannelUI({
  channelName,
  participants,
  currentUserId,
  isMuted,
  isDeafened,
  onToggleMute,
  onToggleDeafen,
  onLeave,
  className,
}: VoiceChannelUIProps) {
  return (
    <div className={className}>
      {/* Channel header */}
      <div className="px-4 py-3 border-b border-border-primary">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔊</span>
          <h3 className="font-semibold text-text-primary">{channelName}</h3>
        </div>
        <p className="text-sm text-text-muted mt-1">
          {participants.length} {participants.length === 1 ? 'participant' : 'participants'}
        </p>
      </div>

      {/* Participants list */}
      <div className="flex-1 overflow-y-auto p-4">
        <VoiceParticipants
          participants={participants}
          currentUserId={currentUserId}
        />
      </div>

      {/* Controls */}
      <div className="p-4 border-t border-border-primary">
        <VoiceControls
          isMuted={isMuted}
          isDeafened={isDeafened}
          onToggleMute={onToggleMute}
          onToggleDeafen={onToggleDeafen}
          onLeave={onLeave}
        />
      </div>
    </div>
  );
}

