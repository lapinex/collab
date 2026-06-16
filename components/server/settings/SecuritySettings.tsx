'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { invalidateServerViewSlices } from '@/lib/query-keys/serverViewKeys';
import { scheduleRefetchServerViewSlices } from '@/hooks/useServerViewQuery';
import { useServerMeta } from '@/hooks/serverView';
import type { Server } from '@/types/server';

interface SecuritySettingsProps {
  serverId: string;
  isOwner: boolean;
}

export function SecuritySettings({ serverId, isOwner }: SecuritySettingsProps) {
  const queryClient = useQueryClient();
  const { data } = useServerMeta(serverId);
  const server = data?.server ?? null;

  const [mediaScanLevel, setMediaScanLevel] = useState<Server['mediaScanLevel']>('none');
  const [linkFilterEnabled, setLinkFilterEnabled] = useState(false);
  const [badWordsFilterLevel, setBadWordsFilterLevel] = useState<Server['badWordsFilterLevel']>('none');
  const [customBadWords, setCustomBadWords] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (server) {
      setMediaScanLevel(server.mediaScanLevel);
      setLinkFilterEnabled(server.linkFilterEnabled);
      setBadWordsFilterLevel(server.badWordsFilterLevel);
      setCustomBadWords(server.customBadWords.join(', '));
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
          mediaScanLevel,
          linkFilterEnabled,
          badWordsFilterLevel,
          customBadWords: customBadWords
            .split(',')
            .map((w) => w.trim())
            .filter((w) => w.length > 0),
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
        <h2 className="text-2xl font-bold mb-2">Security & Moderation</h2>
        <p className="text-text-muted text-sm">Configure security and moderation settings</p>
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
          <Label htmlFor="media-scan-level">Media Scan Level</Label>
          <Select
            value={mediaScanLevel}
            onValueChange={(value) => setMediaScanLevel(value as Server['mediaScanLevel'])}
            disabled={!isOwner}
          >
            <SelectTrigger id="media-scan-level">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="basic">Basic</SelectItem>
              <SelectItem value="strict">Strict</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="link-filter">
            <div className="flex items-center gap-2">
              <input
                id="link-filter"
                type="checkbox"
                checked={linkFilterEnabled}
                onChange={(e) => setLinkFilterEnabled(e.target.checked)}
                disabled={!isOwner}
              />
              <span>Enable Link Filter</span>
            </div>
          </Label>
        </div>

        <div>
          <Label htmlFor="bad-words-filter-level">Bad Words Filter Level</Label>
          <Select
            value={badWordsFilterLevel}
            onValueChange={(value) => setBadWordsFilterLevel(value as Server['badWordsFilterLevel'])}
            disabled={!isOwner}
          >
            <SelectTrigger id="bad-words-filter-level">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="basic">Basic</SelectItem>
              <SelectItem value="strict">Strict</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="custom-bad-words">Custom Bad Words (comma-separated)</Label>
          <Input
            id="custom-bad-words"
            value={customBadWords}
            onChange={(e) => setCustomBadWords(e.target.value)}
            disabled={!isOwner}
            placeholder="word1, word2, word3"
          />
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
