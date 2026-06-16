'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useChannelViewQuery, channelViewQueryKey } from '@/hooks/useChannelViewQuery';
import type { Channel } from '@/types/server';
import { SERVER_LIMITS } from '@/lib/constants';
import { ChannelPermissionsEditor } from './ChannelPermissionsEditor';

interface ChannelEditModalProps {
  channel: Channel;
  channels: Channel[];
  serverId: string;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

export function ChannelEditModal({
  channel,
  channels,
  serverId,
  isOpen,
  onClose,
  onUpdated,
}: ChannelEditModalProps) {
  const queryClient = useQueryClient();
  const { overwrites: permissionOverrides, isLoading: isLoadingOverrides } = useChannelViewQuery(
    isOpen ? channel.id : null
  );

  const [name, setName] = useState(channel.name);
  const [topic, setTopic] = useState(channel.topic || '');
  const [slowmode, setSlowmode] = useState(channel.slowmode);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  const category = channel.parentId
    ? channels.find((c) => c.id === channel.parentId) ?? null
    : null;

  const isSyncedWithCategory = channel.parentId !== null && permissionOverrides.length === 0;

  useEffect(() => {
    if (channel) {
      setName(channel.name);
      setTopic(channel.topic || '');
      setSlowmode(channel.slowmode);
    }
  }, [channel]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/channels/${channel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name,
          topic: topic || null,
          slowmode,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error((data as { error?: string }).error || 'Failed to update channel');
      }

      queryClient.invalidateQueries({ queryKey: channelViewQueryKey(channel.id) });
      onUpdated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update channel');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div className="bg-bg-secondary rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-bold mb-4">Edit Channel: {channel.name}</h3>

        {error && (
          <div className="bg-danger/20 text-danger p-3 rounded-md mb-4 text-sm">
            {error}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <div className="space-y-4 mb-6">
              <div>
                <Label htmlFor="channel-name">Channel Name</Label>
                <Input
                  id="channel-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={SERVER_LIMITS.MAX_CHANNEL_NAME_LENGTH}
                />
              </div>

              <div>
                <Label htmlFor="channel-topic">Topic</Label>
                <Textarea
                  id="channel-topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  maxLength={SERVER_LIMITS.MAX_CHANNEL_TOPIC_LENGTH}
                  rows={3}
                  placeholder="What is this channel about?"
                />
              </div>

              <div>
                <Label htmlFor="channel-slowmode">Slowmode (seconds)</Label>
                <Input
                  id="channel-slowmode"
                  type="number"
                  min="0"
                  max="21600"
                  value={slowmode}
                  onChange={(e) => setSlowmode(parseInt(e.target.value) || 0)}
                />
                <p className="text-xs text-text-muted mt-1">
                  Users will be limited to sending one message every N seconds. Set to 0 to disable.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="permissions" className="mt-4">
            {/* Category sync info */}
            {isSyncedWithCategory && category && (
              <div className="mb-4 p-4 bg-bg-tertiary/50 border border-border-primary rounded-md">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-green-primary"
                      >
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-text-primary mb-1">
                        🔗 Synced with category
                      </div>
                      <p className="text-sm text-text-muted">
                        This channel inherits permissions from <span className="font-medium text-text-secondary">{category.name}</span>.
                        Changes to the category will automatically apply to this channel.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {!isSyncedWithCategory && channel.parentId && category && (
              <div className="mb-4 p-4 bg-bg-tertiary/30 border border-border-primary rounded-md">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-text-muted"
                      >
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-text-primary mb-1">
                        🔗 Not synced with category
                      </div>
                      <p className="text-sm text-text-muted mb-3">
                        This channel has custom permissions that override the category <span className="font-medium text-text-secondary">{category.name}</span>.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          // Delete all channel overwrites to sync with category
                          try {
                            for (const override of permissionOverrides) {
                              const response = await fetch(
                                `/api/channels/${channel.id}/permissions/${override.id}`,
                                {
                                  method: 'DELETE',
                                  credentials: 'include',
                                }
                              );
                              if (!response.ok) {
                                throw new Error('Failed to remove overwrite');
                              }
                            }
                            queryClient.invalidateQueries({ queryKey: channelViewQueryKey(channel.id) });
                          } catch (err) {
                            console.error('Error syncing with category:', err);
                            setError('Failed to sync with category');
                          }
                        }}
                        disabled={isLoadingOverrides || permissionOverrides.length === 0}
                      >
                        Sync with category
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <ChannelPermissionsEditor
              channelId={channel.id}
              serverId={serverId}
              onSave={() => {
                queryClient.invalidateQueries({ queryKey: channelViewQueryKey(channel.id) });
              }}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
