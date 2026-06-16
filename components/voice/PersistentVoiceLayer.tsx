'use client';

import { useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore } from '@/stores/app-store';
import { selectSelectedServerId } from '@/stores/app.selectors';
import { useVoiceSession } from '@/lib/voice-session/useVoiceSession';
import { useSelectedVoiceChannel } from '@/contexts/SelectedVoiceChannelContext';
import { LiveKitVoiceChannel } from '@/components/voice/LiveKitVoiceChannel';

/** DOM id for the slot where voice UI is portaled. Page must render an element with this id when showing voice. */
export const VOICE_UI_SLOT_ID = 'voice-ui-slot';

/**
 * Persistent voice UI layer. Shows as soon as user selects a voice channel (so slot is not black);
 * uses selected channel from context until VoiceSession connects.
 */
export function PersistentVoiceLayer() {
  const { user } = useAuth();
  const selectedServerId = useAppStore(selectSelectedServerId);
  const { channelId, channelName } = useVoiceSession();
  const selectedVoice = useSelectedVoiceChannel();

  const [container, setContainer] = useState<HTMLElement | null>(null);

  // Show UI when either connected to a channel OR user has selected a voice channel (connecting/idle)
  const displayChannelId = channelId ?? selectedVoice?.channelId ?? null;
  const displayChannelName = channelName ?? selectedVoice?.channelName ?? 'Voice Channel';

  useLayoutEffect(() => {
    if (!displayChannelId) {
      setContainer(null);
      return;
    }

    let frameId = 0;
    let observer: MutationObserver | null = null;
    let mountEl: HTMLDivElement | null = null;

    const cleanupMount = () => {
      observer?.disconnect();
      observer = null;

      if (mountEl?.parentNode) {
        mountEl.parentNode.removeChild(mountEl);
      }

      mountEl = null;
    };

    const syncPortalTarget = (slot: HTMLElement) => {
      const hasForeignChildren = Array.from(slot.children).some((child) => child !== mountEl);

      if (hasForeignChildren) {
        cleanupMount();
        setContainer(null);
        return;
      }

      if (!mountEl) {
        mountEl = document.createElement('div');
        slot.appendChild(mountEl);
      }

      setContainer(mountEl);
    };

    const resolveSlot = () => {
      const el = typeof document !== 'undefined' ? document.getElementById(VOICE_UI_SLOT_ID) : null;
      if (el) {
        if (!observer) {
          observer = new MutationObserver(() => syncPortalTarget(el));
          observer.observe(el, { childList: true });
        }

        syncPortalTarget(el);
        return;
      }
      frameId = window.requestAnimationFrame(resolveSlot);
    };

    resolveSlot();

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }

      cleanupMount();
    };
  }, [displayChannelId]);

  if (!displayChannelId || !container) {
    return null;
  }

  return createPortal(
    <LiveKitVoiceChannel
      channelId={displayChannelId}
      channelName={displayChannelName}
      currentUserId={user?.id ?? ''}
      serverId={selectedServerId ?? undefined}
    />,
    container
  );
}
