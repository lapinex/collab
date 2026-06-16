'use client';

import { useState, FormEvent, useEffect } from 'react';
import Image from 'next/image';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiPost } from '@/lib/api-client';
import { SERVER_LIMITS } from '@/lib/constants';
import type { Server } from '@/types/server';

export type JoinCreateServerMode = 'select' | 'join' | 'create';

interface JoinCreateServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: JoinCreateServerMode;
  onServerJoined?: (server: Server) => void;
  onServerCreated?: (server: Server) => void;
}

export function JoinCreateServerModal({
  isOpen,
  onClose,
  initialMode = 'select',
  onServerJoined,
  onServerCreated,
}: JoinCreateServerModalProps) {
  const [mode, setMode] = useState<JoinCreateServerMode>(initialMode);
  const [inviteCode, setInviteCode] = useState('');
  const [serverName, setServerName] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) setMode(initialMode);
  }, [isOpen, initialMode]);

  const handleClose = () => {
    if (!isLoading) {
      setMode(initialMode);
      setInviteCode('');
      setServerName('');
      setIconUrl('');
      setError(null);
      onClose();
    }
  };

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!inviteCode.trim()) {
      setError('Invite code is required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiPost<{ serverId: string; server?: { id: string; name: string } }>('/api/servers/join', {
        code: inviteCode.trim(),
      });

      const serverPayload = response.server ?? { id: response.serverId, name: 'Server' };
      onServerJoined?.({ ...serverPayload, id: response.serverId } as Server);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join server');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!serverName.trim()) {
      setError('Server name is required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiPost<{ server: Server }>('/api/servers', {
        name: serverName.trim(),
        iconUrl: iconUrl.trim() || null,
      });

      onServerCreated?.(response.server);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create server');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} className="max-w-md">
      <ModalHeader onClose={handleClose}>
        {mode === 'select' && 'Join or Create Server'}
        {mode === 'join' && 'Join a Server'}
        {mode === 'create' && 'Create a Server'}
      </ModalHeader>

      <ModalBody className="space-y-4">
        {mode === 'select' && (
          <div className="space-y-3">
            <p className="text-text-secondary text-sm mb-4">
              Choose an option below to get started
            </p>

            <Button
              type="button"
              onClick={() => setMode('join')}
              className="w-full h-auto py-4 flex flex-col items-start gap-2"
              variant="outline"
            >
              <div className="flex items-center gap-3 w-full">
                <div className="w-12 h-12 rounded-full bg-green-primary/20 flex items-center justify-center flex-shrink-0">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-green-primary"
                  >
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <line x1="19" y1="8" x2="19" y2="16" />
                    <line x1="22" y1="12" x2="16" y2="12" />
                  </svg>
                </div>
                <div className="flex-1 text-left">
                  <div className="font-semibold text-text-primary">Join a Server</div>
                  <div className="text-sm text-text-secondary">Enter an invite code to join an existing server</div>
                </div>
              </div>
            </Button>

            <Button
              type="button"
              onClick={() => setMode('create')}
              className="w-full h-auto py-4 flex flex-col items-start gap-2"
              variant="outline"
            >
              <div className="flex items-center gap-3 w-full">
                <div className="w-12 h-12 rounded-full bg-green-primary/20 flex items-center justify-center flex-shrink-0">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-green-primary"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </div>
                <div className="flex-1 text-left">
                  <div className="font-semibold text-text-primary">Create a Server</div>
                  <div className="text-sm text-text-secondary">Create a new server and invite your friends</div>
                </div>
              </div>
            </Button>
          </div>
        )}

        {mode === 'join' && (
          <form onSubmit={handleJoin} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="inviteCode" className="text-sm font-medium text-text-primary">
                INVITE CODE
              </label>
              <Input
                id="inviteCode"
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="Enter invite code"
                disabled={isLoading}
                autoFocus
              />
              <p className="text-xs text-text-secondary">
                Invite codes look like: INVITE123
              </p>
            </div>

            {error && (
              <div className="text-sm text-danger bg-danger/10 border border-danger/20 p-3 rounded-md">
                {error}
              </div>
            )}

            <ModalFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setMode('select');
                  setError(null);
                  setInviteCode('');
                }}
                disabled={isLoading}
              >
                Back
              </Button>
              <Button
                type="submit"
                disabled={isLoading || !inviteCode.trim()}
              >
                {isLoading ? 'Joining...' : 'Join Server'}
              </Button>
            </ModalFooter>
          </form>
        )}

        {mode === 'create' && (
          <form onSubmit={handleCreate} className="space-y-4">
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
                    {serverName ? serverName.charAt(0).toUpperCase() : '?'}
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
                value={serverName}
                onChange={(e) => setServerName(e.target.value)}
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

            {error && (
              <div className="text-sm text-danger bg-danger/10 border border-danger/20 p-3 rounded-md">
                {error}
              </div>
            )}

            <ModalFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setMode('select');
                  setError(null);
                  setServerName('');
                  setIconUrl('');
                }}
                disabled={isLoading}
              >
                Back
              </Button>
              <Button
                type="submit"
                disabled={isLoading || !serverName.trim()}
              >
                {isLoading ? 'Creating...' : 'Create Server'}
              </Button>
            </ModalFooter>
          </form>
        )}
      </ModalBody>
    </Modal>
  );
}
