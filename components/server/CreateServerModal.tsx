'use client';

import Image from 'next/image';

import { useState, FormEvent } from 'react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiPost } from '@/lib/api-client';
import { SERVER_LIMITS } from '@/lib/constants';
import type { Server } from '@/types/server';

interface CreateServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onServerCreated: (server: Server) => void;
}

export function CreateServerModal({
  isOpen,
  onClose,
  onServerCreated,
}: CreateServerModalProps) {
  const [name, setName] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('Server name is required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiPost<{ server: Server }>('/api/servers', {
        name: name.trim(),
        iconUrl: iconUrl.trim() || null,
      });

      onServerCreated(response.server);
      
      // Reset form
      setName('');
      setIconUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create server');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setName('');
      setIconUrl('');
      setError(null);
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <form onSubmit={handleSubmit}>
        <ModalHeader onClose={handleClose}>
          Create a Server
        </ModalHeader>

        <ModalBody className="space-y-4">
          <p className="text-text-secondary text-sm">
            Give your new server a personality with a name and an icon. You can always change it later.
          </p>

          {/* Server Icon Preview */}
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-bg-tertiary border-2 border-dashed border-border-secondary flex items-center justify-center overflow-hidden">
              {iconUrl ? (
                <Image
                  src={iconUrl}
                  alt="Server icon preview"
                  width={80}
                  height={80}
                  className="w-full h-full object-cover"
                  unoptimized={iconUrl.startsWith('data:')}
                  onError={() => setIconUrl('')}
                />
              ) : (
                <span className="text-3xl font-bold text-text-muted">
                  {name ? name.charAt(0).toUpperCase() : '?'}
                </span>
              )}
            </div>
          </div>

          {/* Server Name */}
          <div className="space-y-2">
            <label htmlFor="serverName" className="text-sm font-medium text-text-primary">
              SERVER NAME
            </label>
            <Input
              id="serverName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Awesome Server"
              disabled={isLoading}
              maxLength={SERVER_LIMITS.MAX_SERVER_NAME_LENGTH}
              autoFocus
            />
          </div>

          {/* Icon URL */}
          <div className="space-y-2">
            <label htmlFor="iconUrl" className="text-sm font-medium text-text-primary">
              ICON URL <span className="text-text-muted">(optional)</span>
            </label>
            <Input
              id="iconUrl"
              type="url"
              value={iconUrl}
              onChange={(e) => setIconUrl(e.target.value)}
              placeholder="https://example.com/icon.png"
              disabled={isLoading}
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="text-sm text-danger bg-danger/10 border border-danger/20 p-3 rounded-md">
              {error}
            </div>
          )}
        </ModalBody>

        <ModalFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isLoading || !name.trim()}
          >
            {isLoading ? 'Creating...' : 'Create Server'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
