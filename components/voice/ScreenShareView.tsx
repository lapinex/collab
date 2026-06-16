'use client';

import { useEffect, useRef } from 'react';
import type { RemoteVideoTrack, LocalVideoTrack, RemoteParticipant, LocalParticipant } from 'livekit-client';
import { cn } from '@/lib/utils';

interface ScreenShareViewProps {
  screenTrack: RemoteVideoTrack | LocalVideoTrack | null;
  screenOwner: RemoteParticipant | LocalParticipant | null;
  className?: string;
}

export function ScreenShareView({ screenTrack, screenOwner, className }: ScreenShareViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !screenTrack) return;

    // Attach track to video element
    screenTrack.attach(videoEl);

    return () => {
      // Detach track when component unmounts or track changes
      if (videoEl && screenTrack) {
        screenTrack.detach(videoEl);
      }
    };
  }, [screenTrack]);

  if (!screenTrack || !screenOwner) {
    return null;
  }

  // Parse metadata to get user name
  const parseMetadata = (metadata?: string) => {
    if (!metadata) return null;
    try {
      return JSON.parse(metadata);
    } catch {
      return null;
    }
  };

  const ownerMeta = parseMetadata(screenOwner.metadata);
  const ownerName = screenOwner.name || ownerMeta?.nickname || 'Someone';

  return (
    <div className={cn('w-full bg-bg-primary rounded-lg border border-border-primary overflow-hidden', className)}>
      {/* Header */}
      <div className="px-4 py-2 bg-bg-tertiary border-b border-border-primary flex items-center gap-2">
        <span className="text-sm">🖥</span>
        <span className="text-sm font-medium text-text-primary">
          {ownerName} is sharing screen
        </span>
      </div>
      
      {/* Video */}
      <div className="relative w-full aspect-video bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-contain"
        />
      </div>
    </div>
  );
}
