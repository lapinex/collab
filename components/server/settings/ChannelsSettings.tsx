'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { invalidateServerViewSlices } from '@/lib/query-keys/serverViewKeys';
import { scheduleRefetchServerViewSlices } from '@/hooks/useServerViewQuery';
import { useServerChannels } from '@/hooks/serverView';
import { ChannelEditModal } from './ChannelEditModal';

interface ChannelsSettingsProps {
  serverId: string;
  isOwner: boolean;
}

export function ChannelsSettings({ serverId, isOwner }: ChannelsSettingsProps) {
  const queryClient = useQueryClient();
  const { data } = useServerChannels(serverId);
  const channels = data ?? [];
  const [editingChannel, setEditingChannel] = useState<string | null>(null);

  const channel = editingChannel ? channels.find((c) => c.id === editingChannel) : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Channels</h2>
        <p className="text-text-muted text-sm">Manage channel settings and permissions</p>
      </div>

      <div className="space-y-2">
        {channels.map((channel) => (
          <div
            key={channel.id}
            className="flex items-center justify-between p-3 rounded-md border border-bg-tertiary"
          >
            <div>
              <span className="font-medium">{channel.name}</span>
              <span className="text-xs text-text-muted ml-2">({channel.type})</span>
            </div>
            {isOwner && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingChannel(channel.id)}
              >
                Edit
              </Button>
            )}
          </div>
        ))}
      </div>

      {channel && (
        <ChannelEditModal
          channel={channel}
          channels={channels}
          serverId={serverId}
          isOpen={!!editingChannel}
          onClose={() => setEditingChannel(null)}
          onUpdated={() => {
            setEditingChannel(null);
            setTimeout(() => {
              invalidateServerViewSlices(queryClient, serverId);
              scheduleRefetchServerViewSlices(queryClient, serverId);
            }, 0);
          }}
        />
      )}
    </div>
  );
}
