'use client';

import { Avatar } from '@/components/profile/Avatar';
import { Button } from '@/components/ui/button';
import type { DMIncomingCall } from '@/lib/dm/DMSession';

interface DMIncomingCallOverlayProps {
  incomingCall: DMIncomingCall;
  onAccept: () => void;
  onReject: () => void;
}

export function DMIncomingCallOverlay({ incomingCall, onAccept, onReject }: DMIncomingCallOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-label="Incoming call"
    >
      <div className="rounded-xl bg-bg-tertiary border border-border-primary shadow-xl p-6 flex flex-col items-center gap-4 min-w-[280px]">
        <p className="text-sm text-text-muted">Incoming call</p>
        <Avatar
          src={incomingCall.fromUser.avatarUrl}
          name={incomingCall.fromUser.name}
          size="xl"
          showStatus={false}
        />
        <p className="font-semibold text-text-primary">{incomingCall.fromUser.name}</p>
        <div className="flex gap-3 w-full justify-center">
          <Button
            variant="destructive"
            size="lg"
            onClick={onReject}
            className="flex-1 max-w-[120px]"
            aria-label="Reject call"
          >
            Reject
          </Button>
          <Button
            variant="default"
            size="lg"
            onClick={onAccept}
            className="flex-1 max-w-[120px] bg-green-600 hover:bg-green-700"
            aria-label="Accept call"
          >
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
