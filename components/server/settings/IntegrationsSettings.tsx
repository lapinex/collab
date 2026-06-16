'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { invalidateServerViewSlices } from '@/lib/query-keys/serverViewKeys';
import { scheduleRefetchServerViewSlices } from '@/hooks/useServerViewQuery';
import { useServerWebhooks } from '@/hooks/serverView';

interface IntegrationsSettingsProps {
  serverId: string;
  isOwner: boolean;
}

export function IntegrationsSettings({ serverId, isOwner }: IntegrationsSettingsProps) {
  const queryClient = useQueryClient();
  const { data: webhooksData, isLoading } = useServerWebhooks(serverId);
  const webhooks = webhooksData ?? [];

  const handleDeleteWebhook = async (webhookId: string) => {
    try {
      const response = await fetch(`/api/servers/${serverId}/webhooks/${webhookId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to delete webhook');
      setTimeout(() => {
        invalidateServerViewSlices(queryClient, serverId);
        scheduleRefetchServerViewSlices(queryClient, serverId);
      }, 0);
    } catch (err) {
      console.error('Error deleting webhook:', err);
    }
  };

  if (isLoading) {
    return <div className="text-text-muted">Loading webhooks...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Integrations</h2>
        <p className="text-text-muted text-sm">Manage webhooks and integrations</p>
      </div>

      <div className="space-y-2">
        {webhooks.map((webhook) => (
          <div
            key={webhook.id}
            className="flex items-center justify-between p-3 rounded-md border border-bg-tertiary"
          >
            <div>
              <span className="font-medium">{webhook.name}</span>
              <p className="text-xs text-text-muted">{webhook.url}</p>
            </div>
            {isOwner && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteWebhook(webhook.id)}
              >
                Delete
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
