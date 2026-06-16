/**
 * Syncs VoiceSession snapshot to vv:* slices. Only this layer writes room/participants/order/activeChannel.
 * Called by roomController when it has queryClient (subscribe in connect, unsubscribe on clear).
 */

import type { QueryClient } from '@tanstack/react-query';
import {
  vvRoomKey,
  vvParticipantsKey,
  vvOrderKey,
  vvActiveChannelKey,
  vvMetaKey,
  vvChannelNameKey,
} from '@/lib/voice-view/keys';
import { patchRoomState } from '@/lib/voice-view/patchers';
import type { VoiceSessionSnapshot } from './VoiceSession';

export function applyVoiceSessionSnapshot(
  queryClient: QueryClient,
  snapshot: VoiceSessionSnapshot
): void {
  if (snapshot.channelId) {
    queryClient.setQueryData(
      vvRoomKey(snapshot.channelId),
      patchRoomState(undefined, snapshot.connectionState)
    );
    queryClient.setQueryData(vvParticipantsKey(snapshot.channelId), snapshot.participants);
    queryClient.setQueryData(vvOrderKey(snapshot.channelId), snapshot.order);
    queryClient.setQueryData(vvActiveChannelKey(), snapshot.channelId);
    queryClient.setQueryData(vvMetaKey(snapshot.channelId), snapshot.meta);
    queryClient.setQueryData(vvChannelNameKey(snapshot.channelId), snapshot.channelName);
  } else {
    queryClient.setQueryData(vvActiveChannelKey(), null);
  }
}
