'use client';

import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { invalidateServerViewSlices } from '@/lib/query-keys/serverViewKeys';
import { scheduleRefetchServerViewSlices } from '@/hooks/useServerViewQuery';
import { useServerEmojis, useServerMeta } from '@/hooks/serverView';
import Image from 'next/image';
import { uploadMediaFile } from '@/lib/cloudinary/upload';
import { MEDIA_LIMITS, EMOJI_STICKER_LIMITS } from '@/lib/constants';

interface EmojiStickersSettingsProps {
  serverId: string;
  isOwner: boolean;
}

export function EmojiStickersSettings({ serverId, isOwner }: EmojiStickersSettingsProps) {
  const queryClient = useQueryClient();
  const { data: emojisData, isLoading: isInitialLoadingEmojis } = useServerEmojis(serverId);
  const { data: metaData, isLoading: isInitialLoadingMeta } = useServerMeta(serverId);
  const isInitialLoading = isInitialLoadingEmojis || isInitialLoadingMeta;
  const emojis = emojisData ?? [];
  const stickers = metaData?.stickers ?? [];

  // Emoji form state
  const [showEmojiForm, setShowEmojiForm] = useState(false);
  const [emojiName, setEmojiName] = useState('');
  const [emojiFile, setEmojiFile] = useState<File | null>(null);
  const [emojiPreview, setEmojiPreview] = useState<string | null>(null);
  const [isAddingEmoji, setIsAddingEmoji] = useState(false);
  const [isUploadingEmoji, setIsUploadingEmoji] = useState(false);
  const [emojiError, setEmojiError] = useState<string | null>(null);
  const [isDraggingEmoji, setIsDraggingEmoji] = useState(false);
  const emojiFileInputRef = useRef<HTMLInputElement>(null);
  const emojiDropZoneRef = useRef<HTMLDivElement>(null);
  
  // Sticker form state
  const [showStickerForm, setShowStickerForm] = useState(false);
  const [stickerName, setStickerName] = useState('');
  const [stickerFile, setStickerFile] = useState<File | null>(null);
  const [stickerPreview, setStickerPreview] = useState<string | null>(null);
  const [isAddingSticker, setIsAddingSticker] = useState(false);
  const [isUploadingSticker, setIsUploadingSticker] = useState(false);
  const [stickerError, setStickerError] = useState<string | null>(null);
  const [isDraggingSticker, setIsDraggingSticker] = useState(false);
  const stickerFileInputRef = useRef<HTMLInputElement>(null);
  const stickerDropZoneRef = useRef<HTMLDivElement>(null);

  const handleDeleteEmoji = async (emojiId: string) => {
    try {
      const response = await fetch(`/api/servers/${serverId}/emojis/${emojiId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to delete emoji');
      setTimeout(() => {
        invalidateServerViewSlices(queryClient, serverId);
        scheduleRefetchServerViewSlices(queryClient, serverId);
      }, 0);
    } catch (err) {
      console.error('Error deleting emoji:', err);
    }
  };

  const handleDeleteSticker = async (stickerId: string) => {
    try {
      const response = await fetch(`/api/servers/${serverId}/stickers/${stickerId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to delete sticker');
      setTimeout(() => {
        invalidateServerViewSlices(queryClient, serverId);
        scheduleRefetchServerViewSlices(queryClient, serverId);
      }, 0);
    } catch (err) {
      console.error('Error deleting sticker:', err);
    }
  };

  const uploadFile = async (file: File, folder: 'emojis' | 'stickers' = 'emojis'): Promise<string> => {
    if (!file.type.startsWith('image/')) {
      throw new Error('Please select an image file');
    }
    const maxSize = folder === 'emojis' ? MEDIA_LIMITS.EMOJI_MAX_SIZE : MEDIA_LIMITS.STICKER_MAX_SIZE;
    if (file.size > maxSize) {
      throw new Error(`Image size must be less than ${(maxSize / 1024).toFixed(0)}KB`);
    }
    const m = await uploadMediaFile(file, {
      folder,
      isEmoji: folder === 'emojis',
      isSticker: folder === 'stickers',
      serverId,
    });
    if (typeof m.url === 'string' && m.url.startsWith('/') && typeof window !== 'undefined') {
      return `${window.location.origin}${m.url}`;
    }
    return m.url;
  };

  const handleEmojiFileSelect = (file: File | null) => {
    if (!file) {
      setEmojiFile(null);
      setEmojiPreview(null);
      setEmojiError(null);
      if (emojiFileInputRef.current) {
        emojiFileInputRef.current.value = '';
      }
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setEmojiError('Please select an image file');
      setEmojiFile(null);
      setEmojiPreview(null);
      if (emojiFileInputRef.current) {
        emojiFileInputRef.current.value = '';
      }
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setEmojiError('Image size must be less than 5MB');
      setEmojiFile(null);
      setEmojiPreview(null);
      if (emojiFileInputRef.current) {
        emojiFileInputRef.current.value = '';
      }
      return;
    }

    // Clear any previous errors
    setEmojiError(null);
    
    // Set file first (synchronously) - this should enable the button
    setEmojiFile(file);

    // Create preview (asynchronously)
    const reader = new FileReader();
    reader.onerror = () => {
      // Only reset file if there's a real error reading it
      // Don't reset if it's just a preview generation issue
      setEmojiError('Failed to read image file');
      // Keep the file - user can still try to upload it
    };
    reader.onload = () => {
      if (reader.result) {
        setEmojiPreview(reader.result as string);
        setEmojiError(null);
      }
    };
    reader.onloadend = () => {
      // Preview generation completed (success or failure)
      // File is still valid even if preview failed
    };
    reader.readAsDataURL(file);
  };

  const handleStickerFileSelect = (file: File | null) => {
    if (!file) {
      setStickerFile(null);
      setStickerPreview(null);
      setStickerError(null);
      if (stickerFileInputRef.current) {
        stickerFileInputRef.current.value = '';
      }
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setStickerError('Please select an image file');
      setStickerFile(null);
      setStickerPreview(null);
      if (stickerFileInputRef.current) {
        stickerFileInputRef.current.value = '';
      }
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setStickerError('Image size must be less than 5MB');
      setStickerFile(null);
      setStickerPreview(null);
      if (stickerFileInputRef.current) {
        stickerFileInputRef.current.value = '';
      }
      return;
    }

    // Clear any previous errors
    setStickerError(null);
    
    // Set file first (synchronously) - this should enable the button
    setStickerFile(file);

    // Create preview (asynchronously)
    const reader = new FileReader();
    reader.onerror = () => {
      // Only reset file if there's a real error reading it
      // Don't reset if it's just a preview generation issue
      setStickerError('Failed to read image file');
      // Keep the file - user can still try to upload it
    };
    reader.onload = () => {
      if (reader.result) {
        setStickerPreview(reader.result as string);
        setStickerError(null);
      }
    };
    reader.onloadend = () => {
      // Preview generation completed (success or failure)
      // File is still valid even if preview failed
    };
    reader.readAsDataURL(file);
  };

  const handleAddEmoji = async () => {
    if (!emojiName.trim()) {
      setEmojiError('Name is required');
      return;
    }

    if (!emojiFile) {
      setEmojiError('Please select an image file');
      return;
    }

    setIsAddingEmoji(true);
    setIsUploadingEmoji(true);
    setEmojiError(null);

    try {
      // Upload file first
      const imageUrl = await uploadFile(emojiFile, 'emojis');
      setIsUploadingEmoji(false);

      // Create emoji
      const response = await fetch(`/api/servers/${serverId}/emojis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: emojiName.trim(),
          url: imageUrl,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add emoji');
      }

      setTimeout(() => {
        invalidateServerViewSlices(queryClient, serverId);
        scheduleRefetchServerViewSlices(queryClient, serverId);
      }, 0);

      // Reset form
      setEmojiName('');
      setEmojiFile(null);
      setEmojiPreview(null);
      setShowEmojiForm(false);
      if (emojiFileInputRef.current) {
        emojiFileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('Error adding emoji:', err);
      setEmojiError(err instanceof Error ? err.message : 'Failed to add emoji');
    } finally {
      setIsAddingEmoji(false);
      setIsUploadingEmoji(false);
    }
  };

  const handleAddSticker = async () => {
    if (!stickerName.trim()) {
      setStickerError('Name is required');
      return;
    }

    if (!stickerFile) {
      setStickerError('Please select an image file');
      return;
    }

    setIsAddingSticker(true);
    setIsUploadingSticker(true);
    setStickerError(null);

    try {
      // Upload file first
      const imageUrl = await uploadFile(stickerFile, 'stickers');
      setIsUploadingSticker(false);

      // Create sticker
      const response = await fetch(`/api/servers/${serverId}/stickers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: stickerName.trim(),
          url: imageUrl,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add sticker');
      }

      setTimeout(() => {
        invalidateServerViewSlices(queryClient, serverId);
        scheduleRefetchServerViewSlices(queryClient, serverId);
      }, 0);

      // Reset form
      setStickerName('');
      setStickerFile(null);
      setStickerPreview(null);
      setShowStickerForm(false);
      if (stickerFileInputRef.current) {
        stickerFileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('Error adding sticker:', err);
      setStickerError(err instanceof Error ? err.message : 'Failed to add sticker');
    } finally {
      setIsAddingSticker(false);
      setIsUploadingSticker(false);
    }
  };

  if (isInitialLoading) {
    return <div className="text-text-muted">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Emoji & Stickers</h2>
        <p className="text-text-muted text-sm">Manage server emojis and stickers</p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold">Emojis</h3>
          {isOwner && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowEmojiForm(!showEmojiForm);
                setEmojiError(null);
                if (showEmojiForm) {
                  setEmojiName('');
                  setEmojiFile(null);
                  setEmojiPreview(null);
                  if (emojiFileInputRef.current) {
                    emojiFileInputRef.current.value = '';
                  }
                }
              }}
            >
              {showEmojiForm ? 'Cancel' : 'Add Emoji'}
            </Button>
          )}
        </div>

        {isOwner && showEmojiForm && (
          <div className="mb-4 p-4 border border-bg-tertiary rounded-md space-y-3">
            {emojiError && (
              <div className="bg-danger/20 text-danger p-2 rounded text-sm">
                {emojiError}
              </div>
            )}
            <div>
              <Label htmlFor="emoji-name">Name</Label>
              <Input
                id="emoji-name"
                value={emojiName}
                onChange={(e) => setEmojiName(e.target.value)}
                placeholder="emoji_name"
                maxLength={EMOJI_STICKER_LIMITS.MAX_EMOJI_NAME_LENGTH}
                disabled={isAddingEmoji}
              />
            </div>
            <div>
              <Label>Image File</Label>
              <div
                ref={emojiDropZoneRef}
                className={`border-2 border-dashed rounded-md p-6 text-center cursor-pointer transition-colors ${
                  isDraggingEmoji
                    ? 'border-primary bg-primary/10'
                    : 'border-bg-tertiary hover:border-bg-secondary'
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingEmoji(true);
                }}
                onDragLeave={() => {
                  setIsDraggingEmoji(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingEmoji(false);
                  const file = e.dataTransfer.files[0];
                  if (file) {
                    handleEmojiFileSelect(file);
                  }
                }}
                onClick={() => emojiFileInputRef.current?.click()}
              >
                <input
                  ref={emojiFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    handleEmojiFileSelect(file);
                  }}
                  disabled={isAddingEmoji}
                />
                {emojiPreview ? (
                  <div className="space-y-2">
                    <Image
                      src={emojiPreview}
                      alt="Preview"
                      width={64}
                      height={64}
                      className="w-16 h-16 mx-auto object-contain"
                      unoptimized={emojiPreview.startsWith('data:')}
                    />
                    <p className="text-sm text-text-muted">{emojiFile?.name}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEmojiFile(null);
                        setEmojiPreview(null);
                        if (emojiFileInputRef.current) {
                          emojiFileInputRef.current.value = '';
                        }
                      }}
                      disabled={isAddingEmoji}
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-text-muted">
                      Drag and drop an image here, or click to select
                    </p>
                    <p className="text-xs text-text-muted">
                      Max size: 5MB (PNG, JPG, GIF, WEBP)
                    </p>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!isAddingEmoji && emojiName.trim() && emojiFile) {
                    handleAddEmoji();
                  }
                }}
                disabled={isAddingEmoji || !emojiName.trim() || !emojiFile}
                type="button"
              >
                {isAddingEmoji
                  ? isUploadingEmoji
                    ? 'Uploading...'
                    : 'Adding...'
                  : 'Add Emoji'}
              </Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-4 gap-2">
          {emojis.length === 0 ? (
            <div className="col-span-4 text-text-muted text-sm py-4 text-center">
              No emojis yet. {isOwner && 'Click "Add Emoji" to add one.'}
            </div>
          ) : (
            emojis.map((emoji) => (
              <div key={emoji.id} className="p-2 border border-bg-tertiary rounded-md flex flex-col items-center">
                <Image src={emoji.url} alt={emoji.name} width={32} height={32} className="w-8 h-8 mb-1 object-contain" unoptimized={emoji.url.startsWith('data:') || emoji.url.startsWith('/media/')} />
                <p className="text-xs text-center mb-1">{emoji.name}</p>
                {isOwner && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteEmoji(emoji.id)}
                    className="text-xs"
                  >
                    Delete
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold">Stickers</h3>
          {isOwner && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowStickerForm(!showStickerForm);
                setStickerError(null);
                if (showStickerForm) {
                  setStickerName('');
                  setStickerFile(null);
                  setStickerPreview(null);
                  if (stickerFileInputRef.current) {
                    stickerFileInputRef.current.value = '';
                  }
                }
              }}
            >
              {showStickerForm ? 'Cancel' : 'Add Sticker'}
            </Button>
          )}
        </div>

        {isOwner && showStickerForm && (
          <div className="mb-4 p-4 border border-bg-tertiary rounded-md space-y-3">
            {stickerError && (
              <div className="bg-danger/20 text-danger p-2 rounded text-sm">
                {stickerError}
              </div>
            )}
            <div>
              <Label htmlFor="sticker-name">Name</Label>
              <Input
                id="sticker-name"
                value={stickerName}
                onChange={(e) => setStickerName(e.target.value)}
                placeholder="sticker_name"
                maxLength={EMOJI_STICKER_LIMITS.MAX_STICKER_NAME_LENGTH}
                disabled={isAddingSticker}
              />
            </div>
            <div>
              <Label>Image File</Label>
              <div
                ref={stickerDropZoneRef}
                className={`border-2 border-dashed rounded-md p-6 text-center cursor-pointer transition-colors ${
                  isDraggingSticker
                    ? 'border-primary bg-primary/10'
                    : 'border-bg-tertiary hover:border-bg-secondary'
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingSticker(true);
                }}
                onDragLeave={() => {
                  setIsDraggingSticker(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingSticker(false);
                  const file = e.dataTransfer.files[0];
                  if (file) {
                    handleStickerFileSelect(file);
                  }
                }}
                onClick={() => stickerFileInputRef.current?.click()}
              >
                <input
                  ref={stickerFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    handleStickerFileSelect(file);
                  }}
                  disabled={isAddingSticker}
                />
                {stickerPreview ? (
                  <div className="space-y-2">
                    <Image
                      src={stickerPreview}
                      alt="Preview"
                      width={64}
                      height={64}
                      className="w-16 h-16 mx-auto object-contain"
                      unoptimized={stickerPreview.startsWith('data:')}
                    />
                    <p className="text-sm text-text-muted">{stickerFile?.name}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setStickerFile(null);
                        setStickerPreview(null);
                        if (stickerFileInputRef.current) {
                          stickerFileInputRef.current.value = '';
                        }
                      }}
                      disabled={isAddingSticker}
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-text-muted">
                      Drag and drop an image here, or click to select
                    </p>
                    <p className="text-xs text-text-muted">
                      Max size: 5MB (PNG, JPG, GIF, WEBP)
                    </p>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!isAddingSticker && stickerName.trim() && stickerFile) {
                    handleAddSticker();
                  }
                }}
                disabled={isAddingSticker || !stickerName.trim() || !stickerFile}
                type="button"
              >
                {isAddingSticker
                  ? isUploadingSticker
                    ? 'Uploading...'
                    : 'Adding...'
                  : 'Add Sticker'}
              </Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-4 gap-2">
          {stickers.length === 0 ? (
            <div className="col-span-4 text-text-muted text-sm py-4 text-center">
              No stickers yet. {isOwner && 'Click "Add Sticker" to add one.'}
            </div>
          ) : (
            stickers.map((sticker) => (
              <div key={sticker.id} className="p-2 border border-bg-tertiary rounded-md flex flex-col items-center">
                <Image src={sticker.url} alt={sticker.name} width={32} height={32} className="w-8 h-8 mb-1 object-contain" unoptimized={sticker.url.startsWith('data:') || sticker.url.startsWith('/media/')} />
                <p className="text-xs text-center mb-1">{sticker.name}</p>
                {isOwner && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteSticker(sticker.id)}
                    className="text-xs"
                  >
                    Delete
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
