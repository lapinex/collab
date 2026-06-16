'use client';

import { useState, useEffect } from 'react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { Channel } from '@/types/server';
import { SERVER_LIMITS } from '@/lib/constants';

interface CreateChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after exit animation finishes (for delayed unmount). */
  onClosed?: () => void;
  serverId: string;
  channels: Channel[];
  onChannelCreated?: (channel: Channel) => void;
}

type ChannelType = 'text' | 'voice' | 'category' | 'announcements' | 'forum';

export function CreateChannelModal({
  isOpen,
  onClose,
  onClosed,
  serverId,
  channels,
  onChannelCreated,
}: CreateChannelModalProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<ChannelType>('text');
  const [parentId, setParentId] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get categories for parent selection
  const categories = channels.filter((ch) => ch.type === 'category');

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setName('');
      setType('text');
      setParentId('');
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('Channel name is required');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch(`/api/servers/${serverId}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          type,
          parentId: type !== 'category' && parentId ? parentId : null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create channel');
      }

      const { channel } = await response.json();
      
      // Normalize channel data
      const normalizedChannel: Channel = {
        ...channel,
        createdAt: new Date(channel.createdAt),
        updatedAt: new Date(channel.updatedAt),
      };

      onChannelCreated?.(normalizedChannel);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create channel');
    } finally {
      setIsCreating(false);
    }
  };

  const channelTypes: { value: ChannelType; label: string; description: string }[] = [
    { value: 'text', label: 'Text Channel', description: 'Send messages, images, GIFs, emoji, and opinions' },
    { value: 'voice', label: 'Voice Channel', description: 'Hang out together with voice and video' },
    { value: 'category', label: 'Category', description: 'Organize your channels' },
    { value: 'announcements', label: 'Announcement Channel', description: 'Share important updates' },
    { value: 'forum', label: 'Forum Channel', description: 'Create posts and discussions' },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} onClosed={onClosed} className="max-w-md">
      <ModalHeader onClose={onClose}>Create Channel</ModalHeader>
      
      <form onSubmit={handleSubmit}>
        <ModalBody className="space-y-4">
          {error && (
            <div className="p-3 bg-danger/10 border border-danger/20 rounded-md text-sm text-danger">
              {error}
            </div>
          )}

          {/* Channel Name */}
          <div>
            <Label htmlFor="channel-name">Channel Name</Label>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-text-muted text-lg">
                {type === 'voice' ? '🔊' : type === 'category' ? '📁' : '#'}
              </span>
              <Input
                id="channel-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="new-channel"
                maxLength={SERVER_LIMITS.MAX_CHANNEL_NAME_LENGTH}
                required
                disabled={isCreating}
                className="flex-1"
              />
            </div>
            <p className="mt-1 text-xs text-text-muted">
              Channels are where members communicate
            </p>
          </div>

          {/* Channel Type */}
          <div>
            <Label htmlFor="channel-type">Channel Type</Label>
            <div className="mt-1.5 space-y-2">
              {channelTypes.map((channelType) => (
                <button
                  key={channelType.value}
                  type="button"
                  onClick={() => {
                    setType(channelType.value);
                    // Clear parent if switching to category
                    if (channelType.value === 'category') {
                      setParentId('');
                    }
                  }}
                  className={cn(
                    'w-full text-left p-3 rounded-md border transition-colors',
                    type === channelType.value
                      ? 'bg-green-primary/20 border-green-primary text-text-primary'
                      : 'bg-bg-tertiary border-border-primary text-text-secondary hover:bg-bg-hover hover:text-text-primary',
                  )}
                >
                  <div className="font-medium text-sm">{channelType.label}</div>
                  <div className="text-xs text-text-muted mt-0.5">
                    {channelType.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Parent Category (only for non-category channels) */}
          {type !== 'category' && categories.length > 0 && (
            <div>
              <Label htmlFor="parent-category">Category (Optional)</Label>
              <select
                id="parent-category"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                disabled={isCreating}
                className="mt-1.5 w-full px-3 py-2 bg-bg-tertiary border border-border-primary rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-green-primary focus:border-transparent"
              >
                <option value="">None</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-text-muted">
                Choose a category to organize this channel
              </p>
            </div>
          )}
        </ModalBody>

        <ModalFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isCreating}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isCreating || !name.trim()}>
            {isCreating ? 'Creating...' : 'Create Channel'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}




