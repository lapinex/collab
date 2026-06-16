'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useServerMeta } from '@/hooks/serverView';
import { removeServerViewSlices } from '@/lib/query-keys/serverViewKeys';

interface DangerZoneSettingsProps {
  serverId: string;
  onDelete: () => void;
  isOwner: boolean;
}

export function DangerZoneSettings({ serverId, onDelete, isOwner }: DangerZoneSettingsProps) {
  const queryClient = useQueryClient();
  const { data } = useServerMeta(serverId);
  const server = data?.server ?? null;

  const [confirmName, setConfirmName] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!server) return;

    if (confirmName !== server.name) {
      setError('Server name does not match');
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/servers/${serverId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error((data as { error?: string }).error || 'Failed to delete server');
      }

      removeServerViewSlices(queryClient, serverId);
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      onDelete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete server');
      setIsDeleting(false);
    }
  };

  if (!server) {
    return <div className="text-text-muted">Loading server settings...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2 text-danger">Danger Zone</h2>
        <p className="text-text-muted text-sm">Irreversible and destructive actions</p>
      </div>

      {error && (
        <div className="bg-danger/20 text-danger p-3 rounded-md text-sm">
          {error}
        </div>
      )}

      <div className="border border-danger/50 rounded-md p-4">
        <h3 className="font-semibold mb-2">Delete Server</h3>
        <p className="text-sm text-text-muted mb-4">
          Once you delete a server, there is no going back. Please be certain.
        </p>

        {isOwner ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="confirm-name">
                Type <span className="font-mono font-semibold">{server.name}</span> to confirm
              </Label>
              <Input
                id="confirm-name"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={server.name}
                className="mt-2"
              />
            </div>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting || confirmName !== server.name}
            >
              {isDeleting ? 'Deleting...' : 'Delete Server'}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-text-muted">
            Only the server owner can delete the server.
          </p>
        )}
      </div>
    </div>
  );
}
