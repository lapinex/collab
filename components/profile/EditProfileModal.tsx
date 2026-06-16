'use client';

import { useState, useRef, useEffect } from 'react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Avatar, PresenceStatus } from './Avatar';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { usePresenceStore } from '@/stores/presence-store';
import { selectUpdatePresence, selectUpdateProfile } from '@/stores/auth.selectors';
import { selectMergePresence } from '@/stores/presence.selectors';
import { uploadMediaFile } from '@/lib/cloudinary/upload';
import { MEDIA_LIMITS, USER_LIMITS } from '@/lib/constants';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after exit animation finishes (for delayed unmount). */
  onClosed?: () => void;
  userId: string;
  currentName: string;
  currentAvatarUrl: string | null;
  currentBio: string | null;
  currentEmail: string;
  currentStatus: PresenceStatus;
  onProfileUpdated?: () => void;
}

export function EditProfileModal({
  isOpen,
  onClose,
  onClosed,
  userId,
  currentName,
  currentAvatarUrl,
  currentBio,
  currentEmail,
  currentStatus,
  onProfileUpdated: _onProfileUpdated,
}: EditProfileModalProps) {
  const [name, setName] = useState(currentName);
  const [bio, setBio] = useState(currentBio || '');
  const [avatarUrl, setAvatarUrl] = useState(currentAvatarUrl);
  const [status, setStatus] = useState<PresenceStatus>(currentStatus);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const updateProfile = useAuthStore(selectUpdateProfile);
  const updatePresence = useAuthStore(selectUpdatePresence);
  const mergePresence = usePresenceStore(selectMergePresence);

  useEffect(() => {
    if (isOpen) {
      setName(currentName);
      setBio(currentBio || '');
      setAvatarUrl(currentAvatarUrl);
      setStatus(currentStatus);
      setError(null);
    }
  }, [isOpen, currentName, currentBio, currentAvatarUrl, currentStatus]);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    if (file.size > MEDIA_LIMITS.MAX_IMAGE_SIZE) {
      setError(`Image size must be less than ${(MEDIA_LIMITS.MAX_IMAGE_SIZE / 1024 / 1024).toFixed(0)}MB`);
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const m = await uploadMediaFile(file, { folder: 'avatars' });
      setAvatarUrl(m.url || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload avatar');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    // Store previous values for rollback
    const previousName = currentName;
    const previousAvatarUrl = currentAvatarUrl;
    const previousStatus = currentStatus;

    // Optimistic update - update profile in store immediately
    updateProfile({
      name: name.trim(),
      avatarUrl,
    });

    // Optimistic update - update presence in store if changed
    if (status !== currentStatus) {
      // Map UI PresenceStatus to auth-store format
      // 'idle' -> 'away'
      const storeStatus = status === 'idle' ? 'away' : status;
      updatePresence(storeStatus);
    }

    try {
      // Update profile on server
      const response = await fetch('/api/users/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          bio: bio.trim() || null,
          avatarUrl,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update profile');
      }

      // Update presence status on server if changed
      if (status !== currentStatus) {
        // Map UI PresenceStatus to API format
        // 'idle' -> 'away'
        const apiStatus = status === 'idle' ? 'away' : status;
        const presenceResponse = await fetch('/api/presence', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ status: apiStatus }),
        });

        if (!presenceResponse.ok) {
          // Rollback presence on error
          const previousStoreStatus = previousStatus === 'idle' ? 'away' : previousStatus;
          updatePresence(previousStoreStatus);
          throw new Error('Failed to update presence');
        }
        mergePresence(userId, { status: status === 'idle' ? 'idle' : status });
      }

      onClose();
    } catch (err) {
      // Rollback optimistic updates on error
      updateProfile({
        name: previousName,
        avatarUrl: previousAvatarUrl,
      });
      if (status !== currentStatus) {
        // Map UI PresenceStatus to auth-store format for rollback
        const previousStoreStatus = previousStatus === 'idle' ? 'away' : previousStatus;
        updatePresence(previousStoreStatus);
      }
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  };

  const statusOptions: { value: PresenceStatus; label: string; color: string }[] = [
    { value: 'online', label: 'Online', color: 'bg-status-online' },
    { value: 'idle', label: 'Idle', color: 'bg-status-idle' },
    { value: 'dnd', label: 'Do Not Disturb', color: 'bg-status-dnd' },
    { value: 'offline', label: 'Offline', color: 'bg-status-offline' },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} onClosed={onClosed} className="max-w-md">
      <ModalHeader onClose={onClose}>Edit Profile</ModalHeader>
      
      <ModalBody className="space-y-4">
        {error && (
          <div className="p-3 bg-danger/10 border border-danger/20 rounded-md text-sm text-danger">
            {error}
          </div>
        )}

        {/* Avatar */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <Avatar
              src={avatarUrl}
              name={name}
              size="xl"
              status={status}
              showStatus
              onClick={handleAvatarClick}
              className="cursor-pointer hover:opacity-80 transition-opacity"
            />
            {isUploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleAvatarClick}
            disabled={isUploading}
          >
            {isUploading ? 'Uploading...' : 'Change Avatar'}
          </Button>
        </div>

        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            Display Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={USER_LIMITS.MAX_DISPLAY_NAME_LENGTH}
            className="w-full px-3 py-2 bg-bg-tertiary border border-border-primary rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-green-primary focus:border-transparent"
            placeholder="Enter your name"
          />
        </div>

        {/* Bio */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            About Me
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={USER_LIMITS.MAX_BIO_LENGTH}
            rows={4}
            className="w-full px-3 py-2 bg-bg-tertiary border border-border-primary rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-green-primary focus:border-transparent resize-none"
            placeholder="Tell us about yourself..."
          />
          <div className="text-xs text-text-muted mt-1 text-right">
            {bio.length}/{USER_LIMITS.MAX_BIO_LENGTH}
          </div>
        </div>

        {/* Email (readonly) */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            Email
          </label>
          <input
            type="email"
            value={currentEmail}
            disabled
            className="w-full px-3 py-2 bg-bg-quaternary border border-border-primary rounded-md text-text-muted cursor-not-allowed"
          />
        </div>

        {/* Status */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            Status
          </label>
          <div className="grid grid-cols-2 gap-2">
            {statusOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setStatus(option.value)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-md border transition-colors',
                  status === option.value
                    ? 'bg-green-primary/20 border-green-primary text-text-primary'
                    : 'bg-bg-tertiary border-border-primary text-text-secondary hover:bg-bg-hover hover:text-text-primary',
                )}
              >
                <div className={cn('w-2.5 h-2.5 rounded-full', option.color)} />
                <span className="text-sm">{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      </ModalBody>

      <ModalFooter>
        <Button variant="ghost" onClick={onClose} disabled={isSaving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isSaving || isUploading}>
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

