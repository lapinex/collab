'use client';

import { useState, useEffect } from 'react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/auth-store';
import { apiPatch } from '@/lib/api-client';

interface UserSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UserSettings({ isOpen, onClose }: UserSettingsProps) {
  const { user } = useAuth();
  const { setUser } = useAuthStore.getState();
  const [name, setName] = useState(user?.name || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !user) return;
    setIsLoading(false);
  }, [isOpen, user]);

  const handleSave = async () => {
    if (!user) return;

    setIsSaving(true);
    setError(null);

    try {
      // Update profile name (use PATCH, not POST)
      const profileResponse = await apiPatch<{ user: { id: string; email: string; name: string; avatarUrl: string | null; emailVerified: boolean } }>('/api/users/profile', {
        name: name.trim(),
      });

      if (profileResponse.user) {
        // Update auth store
        setUser({
          id: profileResponse.user.id,
          email: profileResponse.user.email,
          name: profileResponse.user.name,
          avatarUrl: profileResponse.user.avatarUrl,
          emailVerified: profileResponse.user.emailVerified,
        });
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-md">
      <ModalHeader onClose={onClose}>User Settings</ModalHeader>
      <ModalBody className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Display Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your display name"
            disabled={isSaving || isLoading}
          />
        </div>
        {error && (
          <div className="text-sm text-danger bg-danger/10 border border-danger/20 p-3 rounded-md">
            {error}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose} disabled={isSaving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isSaving || isLoading || !name.trim()}>
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
