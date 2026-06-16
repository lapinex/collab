'use client';

import { useRef, useEffect } from 'react';
import type { RemoteAudioTrack } from 'livekit-client';

let container: HTMLDivElement | null = null;
const audioMap = new Map<string, { el: HTMLAudioElement; track: RemoteAudioTrack }>();

function registerContainer(el: HTMLDivElement | null) {
  if (!el) {
    for (const entry of audioMap.values()) {
      try {
        entry.track.detach(entry.el);
        entry.el.remove();
      } catch (err) {
        console.error('[VoiceAudioLayer] cleanup failed:', err);
      }
    }
    audioMap.clear();
  }
  container = el;
}

/**
 * Attach a remote audio track to the persistent layer. UI never touches audio.
 */
export function attachTrack(identity: string, track: RemoteAudioTrack): void {
  if (!container) return;
  const existing = audioMap.get(identity);
  if (existing) {
    try {
      existing.track.detach(existing.el);
      existing.el.remove();
    } catch (err) {
      console.error('[VoiceAudioLayer] detach/remove failed:', err);
    }
    audioMap.delete(identity);
  }
  const el = document.createElement('audio');
  el.autoplay = true;
  el.setAttribute('playsinline', 'true');
  track.attach(el);
  audioMap.set(identity, { el, track });
  container.appendChild(el);
}

/**
 * Detach and remove the audio element for a participant.
 */
export function detachTrack(identity: string): void {
  const entry = audioMap.get(identity);
  if (!entry) return;
  try {
    entry.track.detach(entry.el);
  } catch (err) {
    console.error('[VoiceAudioLayer] detach failed:', err);
  }
  entry.el.remove();
  audioMap.delete(identity);
}

/**
 * Detach all remote audio (e.g. on room disconnect).
 */
export function detachAll(): void {
  for (const entry of audioMap.values()) {
    try {
      entry.track.detach(entry.el);
      entry.el.remove();
    } catch (_) {}
  }
  audioMap.clear();
}

/**
 * Persistent audio layer. Mounted once in layout; audio elements live here
 * and survive any React unmount (portal, channel switch). Only this layer
 * does track.attach/detach — UI never touches audio.
 */
export function VoiceAudioLayer() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    registerContainer(ref.current);
    return () => {
      registerContainer(null);
    };
  }, []);

  return <div ref={ref} style={{ display: 'none' }} aria-hidden="true" />;
}
