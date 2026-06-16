'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Room } from 'livekit-client';
import { Modal, ModalHeader, ModalBody } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { useMicLevel } from '@/hooks/useMicLevel';
import { getVoiceRuntime } from '@/lib/voice-runtime/voiceRuntime';
import { cn } from '@/lib/utils';

interface VoiceSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  room: Room | null;
  isConnected: boolean;
}

export function VoiceSettingsDialog({
  isOpen,
  onClose,
  room,
  isConnected,
}: VoiceSettingsDialogProps) {
  const [audioDevices, setAudioDevices] = useState<{
    input: MediaDeviceInfo[];
    output: MediaDeviceInfo[];
  }>({ input: [], output: [] });
  const [selectedMicId, setSelectedMicId] = useState<string | null>(null);
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string | null>(null);
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [isTestingSpeaker, setIsTestingSpeaker] = useState(false);
  const [micVolume, setMicVolume] = useState(1.0); // 0.0 - 2.0
  const [speakerVolume, setSpeakerVolume] = useState(1.0); // 0.0 - 1.0

  // Web Audio API refs for mic test
  const micTestAudioContextRef = useRef<AudioContext | null>(null);
  const micTestSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micTestDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const micTestGainNodeRef = useRef<GainNode | null>(null);
  const micTestAnalyserRef = useRef<AnalyserNode | null>(null);
  const micTestStreamRef = useRef<MediaStream | null>(null);
  const micTestAudioElementRef = useRef<HTMLAudioElement | null>(null);

  // Get live mic level
  const micLevel = useMicLevel(room, isOpen && isConnected);

  // Load devices and preferences
  useEffect(() => {
    if (!isOpen || !room || !isConnected) return;

    const loadDevices = async () => {
      try {
        const devices = await Room.getLocalDevices('audioinput');
        const outputDevices = await Room.getLocalDevices('audiooutput');

        setAudioDevices({ input: devices, output: outputDevices });

        // Load saved preferences
        const savedMicId = localStorage.getItem('preferredMicId');
        const savedSpeakerId = localStorage.getItem('preferredSpeakerId');
        const savedMicVolume = localStorage.getItem('preferredMicVolume');
        const savedSpeakerVolume = localStorage.getItem('preferredSpeakerVolume');

        setSelectedMicId(savedMicId);
        setSelectedSpeakerId(savedSpeakerId);
        const micVal = savedMicVolume != null ? parseFloat(savedMicVolume) : NaN;
        if (Number.isFinite(micVal)) setMicVolume(micVal);
        const speakerVal = savedSpeakerVolume != null ? parseFloat(savedSpeakerVolume) : NaN;
        if (Number.isFinite(speakerVal)) setSpeakerVolume(speakerVal);
      } catch (error) {
        console.error('Failed to load audio devices:', error);
      }
    };

    loadDevices();
  }, [isOpen, room, isConnected]);

  const handleMicChange = async (deviceId: string) => {
    if (!room) return;

    try {
      await room.switchActiveDevice('audioinput', deviceId);
      setSelectedMicId(deviceId);
      localStorage.setItem('preferredMicId', deviceId);
    } catch (error) {
      console.error('Failed to switch microphone:', error);
    }
  };

  const handleSpeakerChange = async (deviceId: string) => {
    if (!room) return;

    try {
      await room.switchActiveDevice('audiooutput', deviceId);
      setSelectedSpeakerId(deviceId);
      localStorage.setItem('preferredSpeakerId', deviceId);
      // Apply to all active audio elements in VoiceAudioLayer
      void getVoiceRuntime().audioLayer.setOutputDevice(deviceId);
    } catch (error) {
      console.error('Failed to switch speaker:', error);
    }
  };

  const handleTestMic = useCallback(async () => {
    if (isTestingMic) {
      // Stop test - properly disconnect all nodes and stop tracks
      if (micTestSourceRef.current) {
        try {
          micTestSourceRef.current.disconnect();
        } catch (_e) {
          // Ignore disconnect errors
        }
        micTestSourceRef.current = null;
      }
      if (micTestGainNodeRef.current) {
        try {
          micTestGainNodeRef.current.disconnect();
        } catch (_e) {
          // Ignore
        }
        micTestGainNodeRef.current = null;
      }
      if (micTestAnalyserRef.current) {
        try {
          micTestAnalyserRef.current.disconnect();
        } catch (_e) {
          // Ignore
        }
        micTestAnalyserRef.current = null;
      }
      if (micTestDestinationRef.current) {
        try {
          micTestDestinationRef.current.disconnect();
        } catch (_e) {
          // Ignore
        }
        micTestDestinationRef.current = null;
      }
      if (micTestStreamRef.current) {
        // Stop all tracks in the stream
        micTestStreamRef.current.getTracks().forEach(track => {
          track.stop();
        });
        micTestStreamRef.current = null;
      }
      if (micTestAudioElementRef.current) {
        micTestAudioElementRef.current.pause();
        micTestAudioElementRef.current.srcObject = null;
        micTestAudioElementRef.current = null;
      }
      if (micTestAudioContextRef.current) {
        micTestAudioContextRef.current.close().catch(() => {});
        micTestAudioContextRef.current = null;
      }
      setIsTestingMic(false);
      return;
    }

    try {
      // Get fresh microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micTestStreamRef.current = stream;

      // Create AudioContext for loopback
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioContext = new AudioContextClass();
      micTestAudioContextRef.current = audioContext;

      // Create nodes: source → gain → analyser → destination
      const source = audioContext.createMediaStreamSource(stream);
      micTestSourceRef.current = source;

      const gainNode = audioContext.createGain();
      gainNode.gain.value = micVolume;
      micTestGainNodeRef.current = gainNode;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      micTestAnalyserRef.current = analyser;

      const destination = audioContext.createMediaStreamDestination();
      micTestDestinationRef.current = destination;

      // Connect: source → gain → analyser → destination
      source.connect(gainNode);
      gainNode.connect(analyser);
      analyser.connect(destination);

      // Play through selected speaker
      const audio = new Audio();
      audio.srcObject = destination.stream;
      audio.volume = speakerVolume;
      micTestAudioElementRef.current = audio;
      
      if (selectedSpeakerId && 'setSinkId' in audio) {
        (audio as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(selectedSpeakerId).catch(() => {
          // Fallback if setSinkId fails
        });
      }

      await audio.play();
      setIsTestingMic(true);
    } catch (error) {
      console.error('Failed to test microphone:', error);
      setIsTestingMic(false);
      // Cleanup on error
      if (micTestStreamRef.current) {
        micTestStreamRef.current.getTracks().forEach(track => track.stop());
        micTestStreamRef.current = null;
      }
    }
  }, [isTestingMic, micVolume, speakerVolume, selectedSpeakerId]);

  const handleTestSpeaker = async () => {
    if (isTestingSpeaker) {
      setIsTestingSpeaker(false);
      return;
    }

    try {
      // Generate test tone
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioContext = new AudioContextClass();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 440; // A4 note
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3 * speakerVolume, audioContext.currentTime);

      oscillator.start();
      oscillator.stop(audioContext.currentTime + 1); // Play for 1 second

      setIsTestingSpeaker(true);

      oscillator.onended = () => {
        setIsTestingSpeaker(false);
        audioContext.close().catch(() => {});
      };
    } catch (error) {
      console.error('Failed to test speaker:', error);
      setIsTestingSpeaker(false);
    }
  };

  const handleMicVolumeChange = (value: number) => {
    setMicVolume(value);
    localStorage.setItem('preferredMicVolume', value.toString());
    // Update gain node if test is active
    if (micTestGainNodeRef.current) {
      micTestGainNodeRef.current.gain.value = value;
    }
  };

  const handleSpeakerVolumeChange = (value: number) => {
    setSpeakerVolume(value);
    localStorage.setItem('preferredSpeakerVolume', value.toString());
    // Update audio element volume if test is active
    if (micTestAudioElementRef.current) {
      micTestAudioElementRef.current.volume = value;
    }
  };

  // Cleanup on close or unmount
  useEffect(() => {
    return () => {
      // Cleanup mic test if active
      if (isTestingMic) {
        if (micTestSourceRef.current) {
          try { micTestSourceRef.current.disconnect(); } catch (_e) {}
          micTestSourceRef.current = null;
        }
        if (micTestGainNodeRef.current) {
          try { micTestGainNodeRef.current.disconnect(); } catch (_e) {}
          micTestGainNodeRef.current = null;
        }
        if (micTestAnalyserRef.current) {
          try { micTestAnalyserRef.current.disconnect(); } catch (_e) {}
          micTestAnalyserRef.current = null;
        }
        if (micTestDestinationRef.current) {
          try { micTestDestinationRef.current.disconnect(); } catch (_e) {}
          micTestDestinationRef.current = null;
        }
        if (micTestStreamRef.current) {
          micTestStreamRef.current.getTracks().forEach(track => track.stop());
          micTestStreamRef.current = null;
        }
        if (micTestAudioElementRef.current) {
          micTestAudioElementRef.current.pause();
          micTestAudioElementRef.current.srcObject = null;
          micTestAudioElementRef.current = null;
        }
        if (micTestAudioContextRef.current) {
          micTestAudioContextRef.current.close().catch(() => {});
          micTestAudioContextRef.current = null;
        }
        setIsTestingMic(false);
      }
    };
  }, [isTestingMic]);

  // Stop test when dialog closes
  useEffect(() => {
    if (!isOpen && isTestingMic) {
      handleTestMic();
    }
  }, [isOpen, isTestingMic, handleTestMic]);

  // Render volume bars (10 bars)
  const renderVolumeBars = () => {
    const bars = [];
    const barCount = 10;
    const activeBars = Math.ceil(micLevel * barCount);

    for (let i = 0; i < barCount; i++) {
      const isActive = i < activeBars;
      bars.push(
        <div
          key={i}
          className={cn(
            'w-1.5 bg-border-primary rounded-full transition-all duration-75',
            isActive && 'bg-green-primary'
          )}
          style={{
            height: `${((i + 1) / barCount) * 100}%`,
            minHeight: '4px',
          }}
        />
      );
    }

    return bars;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-md bg-bg-primary">
      <ModalHeader onClose={onClose}>Voice Settings</ModalHeader>
      <ModalBody className="space-y-6">
        {!room ? (
          <p className="text-sm text-text-secondary py-4">Join a voice channel to change settings.</p>
        ) : !isConnected ? (
          <p className="text-sm text-text-secondary py-4">Connecting…</p>
        ) : (
        <>
        {/* Microphone Section */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-text-primary">Microphone</h3>

          {/* Microphone Dropdown */}
          <div className="space-y-2">
            <label className="text-xs text-text-secondary">Input Device</label>
            <select
              value={selectedMicId || ''}
              onChange={(e) => handleMicChange(e.target.value)}
              disabled={!isConnected}
              className="w-full px-3 py-2 bg-bg-tertiary border border-border-primary rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-green-primary disabled:opacity-50"
            >
              {audioDevices.input.length === 0 ? (
                <option value="">No microphones found</option>
              ) : (
                audioDevices.input.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || device.deviceId}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Microphone Volume Slider */}
          <div className="space-y-2">
            <label className="text-xs text-text-secondary">Microphone Volume</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={micVolume}
                onChange={(e) => handleMicVolumeChange(parseFloat(e.target.value))}
                disabled={!isConnected}
                className="flex-1 h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                style={{
                  background: `linear-gradient(to right, rgb(34, 197, 94) 0%, rgb(34, 197, 94) ${(micVolume / 2) * 100}%, rgb(55, 65, 81) ${(micVolume / 2) * 100}%, rgb(55, 65, 81) 100%)`
                }}
              />
              <span className="text-xs text-text-secondary w-8 text-right">{Math.round(micVolume * 100)}%</span>
            </div>
          </div>

          {/* Volume Bars */}
          <div className="space-y-2">
            <label className="text-xs text-text-secondary">Input Level</label>
            <div className="flex items-end gap-1 h-12">
              {renderVolumeBars()}
            </div>
          </div>

          {/* Test Microphone Button */}
          <Button
            variant={isTestingMic ? 'destructive' : 'outline'}
            onClick={handleTestMic}
            disabled={!isConnected}
            className="w-full"
            size="sm"
          >
            {isTestingMic ? 'Stop Testing' : 'Test Microphone'}
          </Button>
        </div>

        {/* Headphones/Speakers Section */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-text-primary">Headphones / Output</h3>

          {/* Speaker Dropdown */}
          <div className="space-y-2">
            <label className="text-xs text-text-secondary">Output Device</label>
            <select
              value={selectedSpeakerId || ''}
              onChange={(e) => handleSpeakerChange(e.target.value)}
              disabled={!isConnected}
              className="w-full px-3 py-2 bg-bg-tertiary border border-border-primary rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-green-primary disabled:opacity-50"
            >
              {audioDevices.output.length === 0 ? (
                <option value="">No speakers found</option>
              ) : (
                audioDevices.output.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || device.deviceId}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Speaker Volume Slider */}
          <div className="space-y-2">
            <label className="text-xs text-text-secondary">Speaker Volume</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={speakerVolume}
                onChange={(e) => handleSpeakerVolumeChange(parseFloat(e.target.value))}
                disabled={!isConnected}
                className="flex-1 h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                style={{
                  background: `linear-gradient(to right, rgb(34, 197, 94) 0%, rgb(34, 197, 94) ${speakerVolume * 100}%, rgb(55, 65, 81) ${speakerVolume * 100}%, rgb(55, 65, 81) 100%)`
                }}
              />
              <span className="text-xs text-text-secondary w-8 text-right">{Math.round(speakerVolume * 100)}%</span>
            </div>
          </div>

          {/* Test Speaker Button */}
          <Button
            variant={isTestingSpeaker ? 'destructive' : 'outline'}
            onClick={handleTestSpeaker}
            disabled={!isConnected}
            className="w-full"
            size="sm"
          >
            {isTestingSpeaker ? 'Testing...' : 'Test Speakers'}
          </Button>
        </div>
        </>
        )}
      </ModalBody>
    </Modal>
  );
}
