/**
 * Voice audio layer — plain class, no React. Mounts a hidden container in DOM.
 * Single instance per runtime; attach/detach remote audio tracks.
 */

import type { RemoteAudioTrack } from 'livekit-client';

export interface IVoiceAudioLayer {
  attach(identity: string, track: RemoteAudioTrack): void;
  detach(identity: string): void;
  detachAll(): void;
  setOutputDevice(deviceId: string): Promise<void>;
}

export class VoiceAudioLayer implements IVoiceAudioLayer {
  private container: HTMLElement | null = null;
  private readonly map = new Map<string, { el: HTMLAudioElement; track: RemoteAudioTrack }>();
  private sinkId: string | null = null;

  mount(): void {
    if (typeof document === 'undefined') return;
    if (this.container) return;
    this.container = document.createElement('div');
    this.container.style.display = 'none';
    this.container.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.container);
  }

  attach(identity: string, track: RemoteAudioTrack): void {
    if (!this.container) return;
    const existing = this.map.get(identity);
    if (existing) {
      try {
        existing.track.detach(existing.el);
        existing.el.remove();
      } catch (_) {}
      this.map.delete(identity);
    }
    const el = document.createElement('audio');
    el.autoplay = true;
    el.setAttribute('playsinline', 'true');
    track.attach(el);
    if (this.sinkId && 'setSinkId' in el) {
      (el as HTMLAudioElement & { setSinkId(id: string): Promise<void> })
        .setSinkId(this.sinkId)
        .catch(() => {});
    }
    this.map.set(identity, { el, track });
    this.container.appendChild(el);
  }

  detach(identity: string): void {
    const entry = this.map.get(identity);
    if (!entry) return;
    try {
      entry.track.detach(entry.el);
    } catch (_) {}
    entry.el.remove();
    this.map.delete(identity);
  }

  detachAll(): void {
    for (const entry of this.map.values()) {
      try {
        entry.track.detach(entry.el);
        entry.el.remove();
      } catch (_) {}
    }
    this.map.clear();
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    this.sinkId = deviceId || null;
    const promises: Promise<void>[] = [];
    for (const { el } of this.map.values()) {
      if ('setSinkId' in el) {
        promises.push(
          (el as HTMLAudioElement & { setSinkId(id: string): Promise<void> })
            .setSinkId(deviceId)
            .catch(() => {})
        );
      }
    }
    await Promise.all(promises);
  }
}
