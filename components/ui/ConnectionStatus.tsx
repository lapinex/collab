'use client';

import { useRealtimeManager } from '@/hooks/useRealtimeManager';
import { useAuthStore } from '@/stores/auth-store';

const STATUS_COLORS: Record<string, string> = {
  connected: 'bg-green-500',
  connecting: 'bg-yellow-500 animate-pulse',
  disconnected: 'bg-red-500',
  reconnecting: 'bg-orange-500 animate-pulse',
};

export function ConnectionStatus() {
  const status = useRealtimeManager();
  const user = useAuthStore((s) => s.user);
  const colorClass = STATUS_COLORS[status.status] ?? 'bg-gray-500';

  const label =
    status.status === 'connected'
      ? 'Connected'
      : status.status === 'connecting'
        ? 'Connecting...'
        : status.status === 'reconnecting'
          ? `Reconnecting (${status.reconnectAttempts}/${10})`
          : user === null
            ? 'Sign in to connect'
            : 'Disconnected';

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div
        className={`w-2 h-2 rounded-full flex-shrink-0 ${colorClass}`}
        title={label}
        aria-hidden
      />
      <span className="text-xs text-text-secondary truncate">
        {label}
        {status.queuedEvents > 0 && user !== null && (
          <span className="ml-1">· {status.queuedEvents} pending</span>
        )}
      </span>
    </div>
  );
}
