'use client';

import { useEffect, useState, useRef } from 'react';
import { Room } from 'livekit-client';

/**
 * Hook to get live microphone volume level (0-1)
 * Uses Web Audio API to analyze microphone input
 */
export function useMicLevel(room: Room | null, isActive: boolean) {
  const [micLevel, setMicLevel] = useState(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!room || !isActive) {
      setMicLevel(0);
      return;
    }

    let mounted = true;

    const setupAudioAnalysis = async () => {
      try {
        // Get microphone track from LiveKit
        const localParticipant = room.localParticipant;
        if (!localParticipant) return;

        const trackPublications = localParticipant.getTrackPublications();
        const micTrack = trackPublications.find(
          (pub) => pub.kind === 'audio' && pub.source === 'microphone'
        );

        if (!micTrack || !micTrack.track) {
          console.warn('[useMicLevel] No microphone track found');
          return;
        }

        const mediaStream = new MediaStream([micTrack.track.mediaStreamTrack]);

        // Create AudioContext
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = audioContext;

        // Create analyser node
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        analyserRef.current = analyser;

        // Connect microphone to analyser
        const source = audioContext.createMediaStreamSource(mediaStream);
        sourceRef.current = source;
        source.connect(analyser);

        // Start analyzing
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const updateLevel = () => {
          if (!mounted) return;

          analyser.getByteFrequencyData(dataArray);

          // Calculate average volume
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i] ?? 0;
          }
          const average = sum / dataArray.length;
          const normalizedLevel = Math.min(average / 255, 1); // Normalize to 0-1

          setMicLevel(normalizedLevel);

          animationFrameRef.current = requestAnimationFrame(updateLevel);
        };

        updateLevel();
      } catch (error) {
        console.error('[useMicLevel] Failed to setup audio analysis:', error);
      }
    };

    setupAudioAnalysis();

    return () => {
      mounted = false;

      // Cleanup
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      if (sourceRef.current) {
        try {
          sourceRef.current.disconnect();
        } catch (e) {
          // Ignore
        }
      }

      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {
          // Ignore
        });
      }

      analyserRef.current = null;
      sourceRef.current = null;
      audioContextRef.current = null;
      setMicLevel(0);
    };
  }, [room, isActive]);

  return micLevel;
}
