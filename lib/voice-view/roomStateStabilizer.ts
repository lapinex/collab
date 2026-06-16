/**
 * Anti-flap room state: UI updates only after state has held for ≥ delay ms.
 * Prevents connected/reconnecting flicker on bad network.
 */

import type { VoiceConnectionState } from './keys';

let timer: ReturnType<typeof setTimeout> | null = null;

export function stabilizeRoomState(
  next: VoiceConnectionState,
  apply: (s: VoiceConnectionState) => void,
  delay = 600
): void {
  if (timer) clearTimeout(timer);

  timer = setTimeout(() => {
    timer = null;
    apply(next);
  }, delay);
}

export function clearRoomStateStabilizer(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
