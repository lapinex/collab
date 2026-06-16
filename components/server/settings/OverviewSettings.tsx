'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { invalidateServerViewSlices } from '@/lib/query-keys/serverViewKeys';
import { scheduleRefetchServerViewSlices } from '@/hooks/useServerViewQuery';
import { useServerMeta } from '@/hooks/serverView';
import type { Server } from '@/types/server';
import { SERVER_LIMITS } from '@/lib/constants';

interface OverviewSettingsProps {
  serverId: string;
  isOwner: boolean;
}

export function OverviewSettings({ serverId, isOwner }: OverviewSettingsProps) {
  const queryClient = useQueryClient();
  const { data } = useServerMeta(serverId);
  const server = data?.server ?? null;

  const [name, setName] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [description, setDescription] = useState('');
  const [verificationLevel, setVerificationLevel] = useState<Server['verificationLevel']>('none');
  const [voiceRegion, setVoiceRegion] = useState('auto');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (server) {
      setName(server.name);
      setIconUrl(server.iconUrl || '');
      setDescription(server.description || '');
      setVerificationLevel(server.verificationLevel);
      setVoiceRegion(server.voiceRegion);
    }
  }, [server]);

  const handleSave = async () => {
    if (!server) return;

    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch(`/api/servers/${serverId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name,
          iconUrl: iconUrl || null,
          description: description || null,
          verificationLevel,
          voiceRegion,
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
        <h2 className="text-2xl font-bold mb-2">Overview</h2>
        <p className="text-text-muted text-sm">Basic server information and settings</p>
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
          <Label htmlFor="server-name">Server Name</Label>
          <Input
            id="server-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!isOwner}
            maxLength={SERVER_LIMITS.MAX_SERVER_NAME_LENGTH}
          />
        </div>

        <div>
          <Label htmlFor="server-icon">Server Icon URL</Label>
          <Input
            id="server-icon"
            type="url"
            value={iconUrl}
            onChange={(e) => setIconUrl(e.target.value)}
            disabled={!isOwner}
            placeholder="https://example.com/icon.png"
          />
        </div>

        <div>
          <Label htmlFor="server-description">Server Description</Label>
          <Textarea
            id="server-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!isOwner}
            maxLength={SERVER_LIMITS.MAX_DESCRIPTION_LENGTH}
            rows={3}
            placeholder="What is this server about?"
          />
        </div>

        <div>
          <Label htmlFor="verification-level">Verification Level</Label>
          <Select
            value={verificationLevel}
            onValueChange={(value) => setVerificationLevel(value as Server['verificationLevel'])}
            disabled={!isOwner}
          >
            <SelectTrigger id="verification-level">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="very_high">Very High</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="voice-region">Voice Region</Label>
          <Input
            id="voice-region"
            value={voiceRegion}
            onChange={(e) => setVoiceRegion(e.target.value)}
            disabled={!isOwner}
            placeholder="auto"
          />
          <p className="text-xs text-text-muted mt-1">Leave as &quot;auto&quot; for automatic region selection</p>
        </div>
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
