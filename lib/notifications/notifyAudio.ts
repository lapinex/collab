/**
 * Discord-style notification sound: two soft oscillators, WebAudio only.
 * 620 Hz → 0.06s, then 880 Hz → 0.08s with fade. Very quiet.
 */

export function preloadNotifyAudio(): void {
  // WebAudio has no preload; no-op for API compatibility
}

export function playNotifyAudio(): void {
  try {
    if (typeof window === 'undefined' || !window.AudioContext) return;
    const ctx = new window.AudioContext();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.connect(ctx.destination);

    const playTone = (freq: number, startTime: number, duration: number, vol: number) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = freq;
      osc.type = 'sine';
      osc.connect(gain);
      gain.gain.setValueAtTime(vol, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    playTone(620, ctx.currentTime, 0.06, 0.08);
    playTone(880, ctx.currentTime + 0.04, 0.08, 0.06);
  } catch {
    // ignore
  }
}
