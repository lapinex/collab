'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { invalidateServerViewSlices } from '@/lib/query-keys/serverViewKeys';
import { scheduleRefetchServerViewSlices } from '@/hooks/useServerViewQuery';
import { useServerMeta, useServerChannels } from '@/hooks/serverView';

interface CommunitySettingsProps {
  serverId: string;
  isOwner: boolean;
}

export function CommunitySettings({ serverId, isOwner }: CommunitySettingsProps) {
  const queryClient = useQueryClient();
  const { data: meta } = useServerMeta(serverId);
  const { data: channelsData } = useServerChannels(serverId);
  const server = meta?.server ?? null;
  const serverChannels = channelsData ?? [];

  const [isCommunity, setIsCommunity] = useState(false);
  const [rulesChannelId, setRulesChannelId] = useState('');
  const [announcementsChannelId, setAnnouncementsChannelId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (server) {
      setIsCommunity(server.isCommunity);
      setRulesChannelId(server.rulesChannelId || '');
      setAnnouncementsChannelId(server.announcementsChannelId || '');
    }
  }, [server]);

  const handleSave = async () => {
    if (!server) return;

    setIsSaving(true);
    setError(null);
    setSuccess(false);

    if (isCommunity && (!rulesChannelId || !announcementsChannelId)) {
      setError('Community mode requires rules channel and announcements channel');
      setIsSaving(false);
      return;
    }

    try {
      const response = await fetch(`/api/servers/${serverId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          isCommunity,
          rulesChannelId: rulesChannelId || null,
          announcementsChannelId: announcementsChannelId || null,
        }),
      });

      if (!response.ok) throw new Error('Failed to update server');

      setTimeout(() => {
        invalidateServerViewSlices(queryClient, serverId);
        scheduleRefetchServerViewSlices(queryClient, serverId);
      }, 0);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError('Failed to save settings');
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!server) {
    return <div className="text-text-muted">Loading server settings...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Community</h2>
        <p className="text-text-muted text-sm">Configure community features</p>
      </div>

      {error && (
        <div className="bg-danger/20 text-danger p-3 rounded-md text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-success/20 text-success p-3 rounded-md text-sm">
          Settings saved successfully!
        </div>
      )}

      <div className="space-y-4">
        <div>
          <Label htmlFor="community-mode">
            <div className="flex items-center gap-2">
              <input
                id="community-mode"
                type="checkbox"
                checked={isCommunity}
                onChange={(e) => setIsCommunity(e.target.checked)}
                disabled={!isOwner}
              />
              <span>Enable Community Mode</span>
            </div>
          </Label>
          <p className="text-xs text-text-muted mt-1">
            Community mode requires rules and announcements channels
          </p>
        </div>

        {isCommunity && (
          <>
            <div>
              <Label htmlFor="rules-channel">Rules Channel</Label>
              <select
                id="rules-channel"
                value={rulesChannelId}
                onChange={(e) => setRulesChannelId(e.target.value)}
                disabled={!isOwner}
                className="w-full px-3 py-2 rounded-md bg-bg-primary border border-border-primary text-text-primary"
              >
                <option value="">Select a channel</option>
                {serverChannels
                  .filter((ch) => ch.type === 'text' || ch.type === 'announcements')
                  .map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.name}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <Label htmlFor="announcements-channel">Announcements Channel</Label>
              <select
                id="announcements-channel"
                value={announcementsChannelId}
                onChange={(e) => setAnnouncementsChannelId(e.target.value)}
                disabled={!isOwner}
                className="w-full px-3 py-2 rounded-md bg-bg-primary border border-border-primary text-text-primary"
              >
                <option value="">Select a channel</option>
                {serverChannels
                  .filter((ch) => ch.type === 'announcements')
                  .map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.name}
                    </option>
                  ))}
              </select>
            </div>
          </>
        )}
      </div>

      {isOwner && (
        <div className="flex justify-end gap-2">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      )}
    </div>
  );
}
