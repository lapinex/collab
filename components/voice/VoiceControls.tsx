'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface VoiceControlsProps {
  isMuted: boolean;
  isDeafened: boolean;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onLeave: () => void;
  className?: string;
}

export function VoiceControls({
  isMuted,
  isDeafened,
  onToggleMute,
  onToggleDeafen,
  onLeave,
  className,
}: VoiceControlsProps) {
  return (
    <div className={cn('flex items-center gap-2 p-3 bg-bg-quaternary rounded-lg', className)}>
      {/* Mute button */}
      <Button
        variant={isMuted ? 'destructive' : 'secondary'}
        size="icon"
        onClick={onToggleMute}
        title={isMuted ? 'Unmute' : 'Mute'}
        className={cn(
          'h-10 w-10',
          isMuted && 'bg-danger/20 hover:bg-danger/30 text-danger'
        )}
      >
        {isMuted ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
        )}
      </Button>

      {/* Deafen button */}
      <Button
        variant={isDeafened ? 'destructive' : 'secondary'}
        size="icon"
        onClick={onToggleDeafen}
        title={isDeafened ? 'Undeafen' : 'Deafen'}
        className={cn(
          'h-10 w-10',
          isDeafened && 'bg-danger/20 hover:bg-danger/30 text-danger'
        )}
      >
        {isDeafened ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M17.5 17.5L12 12m0 0L6.5 6.5M12 12l5.5-5.5M12 12l-5.5 5.5" />
            <path d="M2 2l20 20" />
            <path d="M22 12h-4M4 12H2M12 2v4M12 22v-4" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="22" />
            <line x1="8" y1="22" x2="16" y2="22" />
          </svg>
        )}
      </Button>

      {/* Leave button */}
      <Button
        variant="destructive"
        size="icon"
        onClick={onLeave}
        title="Leave Voice Channel"
        className="h-10 w-10 ml-auto"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="22" y1="11" x2="16" y2="11" />
          <polyline points="19 8 22 11 19 14" />
        </svg>
      </Button>
    </div>
  );
}
