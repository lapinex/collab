'use client';

import { useState, FormEvent, KeyboardEvent, useRef, useCallback, useEffect, ClipboardEvent, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import { apiGet, apiPost } from '@/lib/api-client';
import { MediaPreview, type MediaPreviewItem } from '@/components/chat/MediaPreview';
import { uploadMediaFile } from '@/lib/cloudinary/upload';
import { MEDIA_LIMITS, MESSAGE_LIMITS } from '@/lib/constants';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';

// Lazy pickers — load on first open (Phase 4 perf)
const MediaPickerPopover = dynamic(
  () => import('@/components/chat/MediaPickerPopover').then(m => ({ default: m.MediaPickerPopover })),
  { ssr: false }
);
const EmojiPickerPopover = dynamic(
  () => import('@/components/chat/EmojiPickerPopover').then(m => ({ default: m.EmojiPickerPopover })),
  { ssr: false }
);
const StickerPickerPopover = dynamic(
  () => import('@/components/chat/StickerPickerPopover').then(m => ({ default: m.StickerPickerPopover })),
  { ssr: false }
);
const GiphyPickerPopover = dynamic(
  () => import('@/components/chat/GiphyPickerPopover').then(m => ({ default: m.GiphyPickerPopover })),
  { ssr: false }
);

export type MediaPayload = Array<{
  mediaId?: string;
  url: string;
  public_id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}>;

/** For mention autocomplete: user or role. */
export interface MentionOption {
  type: 'user' | 'role' | 'everyone';
  id?: string;
  /** Inserted into content: @Name or @&Name or @everyone */
  insertText: string;
  /** Shown in dropdown: "Name (пользователь)" / "Name (роль)" / "@everyone" */
  label: string;
}

interface SlashCommandHint {
  name: string;
  description: string;
}

interface MessageInputProps {
  channelId?: string | null;
  onSendMessage: (content: string, replyToMessageId?: string | null, media?: MediaPayload) => void;
  disabled?: boolean;
  placeholder?: string;
  replyTo?: {
    id: string;
    content: string;
    user: {
      id: string;
      name: string;
    };
  } | null;
  onCancelReply?: () => void;
  canAttachFiles?: boolean;
  canMentionEveryone?: boolean;
  serverId?: string; // For server emojis and stickers
  /** Members for @ mention autocomplete (server members or DM partner). */
  mentionMembers?: Array<{ id: string; displayName: string }>;
  /** Roles for @& mention autocomplete (server only). */
  mentionRoles?: Array<{ id: string; name: string }>;
}

function inferType(file: File): 'image' | 'video' | 'gif' {
  const t = file.type.toLowerCase();
  const fileName = file.name.toLowerCase();
  
  // Check MIME type first
  if (t === 'image/gif') return 'gif';
  if (t.startsWith('video/')) return 'video';
  
  // Fallback: check file extension if MIME type is not set or generic
  if (fileName.endsWith('.gif')) return 'gif';
  if (fileName.match(/\.(mp4|webm|mov|avi|mkv)$/)) return 'video';
  
  return 'image';
}

/** Get mention context: query after @ or @& and start index. */
function getMentionContext(content: string, cursor: number): { query: string; prefix: '@' | '@&'; start: number } | null {
  let i = cursor - 1;
  while (i >= 0 && content[i] !== '\n' && content[i] !== ' ') {
    i--;
  }
  const chunk = content.slice(i + 1, cursor);
  if (chunk.startsWith('@&')) {
    return { query: chunk.slice(2).toLowerCase(), prefix: '@&', start: i + 1 };
  }
  if (chunk.startsWith('@')) {
    return { query: chunk.slice(1).toLowerCase(), prefix: '@', start: i + 1 };
  }
  return null;
}


export function MessageInput({
  channelId,
  onSendMessage,
  disabled,
  placeholder = 'Type a message...',
  replyTo,
  onCancelReply,
  canAttachFiles = true,
  canMentionEveryone = true,
  serverId,
  mentionMembers = [],
  mentionRoles = [],
}: MessageInputProps) {
  const { startTyping, stopTyping, startUploading, stopUploading } = useTypingIndicator(channelId ?? null);

  useEffect(() => {
    return () => {
      stopTyping();
    };
  }, [stopTyping]);

  const [content, setContent] = useState('');
  const [pendingMedia, setPendingMedia] = useState<MediaPreviewItem[]>([]);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [sending, setSending] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [slashHints, setSlashHints] = useState<SlashCommandHint[]>([]);
  const [slashInfo, setSlashInfo] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const [mentionState, setMentionState] = useState<{
    query: string;
    prefix: '@' | '@&';
    start: number;
    selectedIndex: number;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaButtonRef = useRef<HTMLButtonElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const gifButtonRef = useRef<HTMLButtonElement>(null);
  const stickerButtonRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);

  const mentionOptions = useMemo((): MentionOption[] => {
    if (!mentionState) return [];
    const { query, prefix } = mentionState;
    const options: MentionOption[] = [];
    if (prefix === '@') {
      if (canMentionEveryone && 'everyone'.startsWith(query)) {
        options.push({ type: 'everyone', insertText: '@everyone', label: '@everyone' });
      }
      const q = query.trim();
      mentionMembers.forEach((m) => {
        const dn = (m.displayName || '').toLowerCase();
        if (!q || dn.includes(q) || dn.startsWith(q)) {
          options.push({
            type: 'user',
            id: m.id,
            insertText: `@${m.displayName || m.id}`,
            label: `${m.displayName || m.id} (пользователь)`,
          });
        }
      });
      mentionRoles.forEach((r) => {
        const n = (r.name || '').toLowerCase();
        if (!q || n.includes(q) || n.startsWith(q)) {
          options.push({
            type: 'role',
            id: r.id,
            insertText: `@&${r.name || r.id}`,
            label: `${r.name || r.id} (роль)`,
          });
        }
      });
    } else {
      mentionRoles.forEach((r) => {
        const n = (r.name || '').toLowerCase();
        if (!query || n.includes(query) || n.startsWith(query)) {
          options.push({
            type: 'role',
            id: r.id,
            insertText: `@&${r.name || r.id}`,
            label: `${r.name || r.id} (роль)`,
          });
        }
      });
    }
    return options.slice(0, MESSAGE_LIMITS.MAX_MENTION_OPTIONS);
  }, [mentionState, canMentionEveryone, mentionMembers, mentionRoles]);

  useEffect(() => {
    if (!mentionState || mentionOptions.length === 0) return;
    const list = mentionListRef.current;
    const child = list?.children[mentionState.selectedIndex];
    if (child) (child as HTMLElement).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [mentionState, mentionOptions.length]);

  useEffect(() => {
    if (!serverId || !content.trim().startsWith('/')) {
      setSlashHints([]);
      return;
    }
    const q = content.trim().slice(0, 32);
    const t = setTimeout(async () => {
      try {
        const data = await apiGet<{ commands: SlashCommandHint[] }>(
          `/api/commands?serverId=${encodeURIComponent(serverId)}&q=${encodeURIComponent(q)}`
        );
        setSlashHints(data.commands ?? []);
      } catch {
        setSlashHints([]);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [content, serverId]);

  const addFiles = useCallback((files: File[]) => {
    setUploadError(null); // Clear error when adding new files

    for (const file of files) {
      const fileType = inferType(file);
      const fileSize = file.size;
      const fileName = file.name || 'unknown file';
      const sizeMB = (fileSize / 1024 / 1024).toFixed(2);

      if (fileType === 'gif' && fileSize > MEDIA_LIMITS.MAX_GIF_SIZE) {
        const maxMB = (MEDIA_LIMITS.MAX_GIF_SIZE / 1024 / 1024).toFixed(0);
        const errorMsg = `GIF "${fileName}" is too large (${sizeMB}MB). Maximum size is ${maxMB}MB.`;
        setUploadError(errorMsg);
        alert(errorMsg);
        return;
      }
      if (fileType === 'video' && fileSize > MEDIA_LIMITS.MAX_VIDEO_SIZE) {
        const maxMB = (MEDIA_LIMITS.MAX_VIDEO_SIZE / 1024 / 1024).toFixed(0);
        const errorMsg = `Video "${fileName}" is too large (${sizeMB}MB). Maximum size is ${maxMB}MB.`;
        setUploadError(errorMsg);
        alert(errorMsg);
        return;
      }
      if (fileType === 'image' && fileSize > MEDIA_LIMITS.MAX_IMAGE_SIZE) {
        const maxMB = (MEDIA_LIMITS.MAX_IMAGE_SIZE / 1024 / 1024).toFixed(0);
        const errorMsg = `Image "${fileName}" is too large (${sizeMB}MB). Maximum size is ${maxMB}MB.`;
        setUploadError(errorMsg);
        alert(errorMsg);
        return;
      }
    }
    
    const next: MediaPreviewItem[] = files.map((f) => ({
      id: `file_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      file: f,
      url: URL.createObjectURL(f),
      type: inferType(f),
    }));
    setPendingMedia((prev) => [...prev, ...next]);
  }, []);

  const addStickerUrl = useCallback((stickerUrl: string) => {
    setUploadError(null);
    setPendingMedia((prev) => [
      ...prev,
      {
        id: `sticker_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        url: stickerUrl,
        type: 'sticker' as const,
      },
    ]);
  }, []);

  const addGifUrl = useCallback(async (gifUrl: string, isGif = false) => {
    setUploadError(null); // Clear error when adding new media
    try {
      const res = await fetch(gifUrl, { mode: 'cors' });
      if (!res.ok) {
        throw new Error(`Failed to fetch: ${res.status}`);
      }
      
      const blob = await res.blob();
      
      // Check if it's actually a GIF by MIME type, URL extension, or explicit flag
      const urlLower = gifUrl.toLowerCase();
      const hasGifExtension = urlLower.includes('.gif') || urlLower.includes('/gif');
      const isActuallyGif = isGif || blob.type === 'image/gif' || hasGifExtension;
      
      // For GIFs, ensure we have the correct MIME type
      // Some CDNs may return generic types, so we check the URL and blob
      let finalMimeType = blob.type;
      let fileName = '';
      
      if (isActuallyGif) {
        finalMimeType = 'image/gif';
        fileName = `gif_${Date.now()}.gif`;
        
      } else {
        // For non-GIFs, try to determine file extension from URL or blob type
        const extension = blob.type.split('/')[1] || 'png';
        fileName = `media_${Date.now()}.${extension}`;
        finalMimeType = blob.type || 'image/png';
      }
      
      // Create File with explicit MIME type
      const file = new File([blob], fileName, { 
        type: finalMimeType
      });
      
      const url = URL.createObjectURL(blob);
      setPendingMedia((prev) => [
        ...prev,
        {
          id: `${isActuallyGif ? 'gif' : 'media'}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          file,
          url,
          type: isActuallyGif ? 'gif' : 'image',
        },
      ]);
    } catch (e) {
      console.error('Failed to fetch media:', e);
      const errorMessage = e instanceof Error ? e.message : 'Failed to load GIF. Please try again.';
      setUploadError(errorMessage);
      // Show user-friendly error
      alert(errorMessage);
    }
  }, []);

  const removeMedia = useCallback((id: string) => {
    setPendingMedia((prev) => {
      const item = prev.find((p) => p.id === id);
      if (item && item.url) {
        URL.revokeObjectURL(item.url);
      }
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  // Paste handler for images
  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData.items;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item && item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        addFiles(files);
      }
    },
    [addFiles]
  );

  // Drag & drop handler
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer?.types.includes('Files')) {
        setIsDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        addFiles(Array.from(files));
      }
    };

    container.addEventListener('dragover', handleDragOver);
    container.addEventListener('dragleave', handleDragLeave);
    container.addEventListener('drop', handleDrop);

    return () => {
      container.removeEventListener('dragover', handleDragOver);
      container.removeEventListener('dragleave', handleDragLeave);
      container.removeEventListener('drop', handleDrop);
    };
  }, [addFiles]);

  // Insert emoji at cursor position
  const insertAtCursor = useCallback((text: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setContent((c) => c + text);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = content.substring(0, start);
    const after = content.substring(end);
    const newContent = before + text + after;
    setContent(newContent);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  }, [content]);

  const uploadMedia = useCallback(async (): Promise<MediaPayload> => {
    const out: MediaPayload = [];
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = new AbortController();
    const signal = uploadAbortRef.current.signal;
    setUploading(true);
    const firstItem = pendingMedia[0];
    const uploadType: 'image' | 'video' | 'file' =
      firstItem?.type === 'video' ? 'video' : firstItem?.type === 'gif' || firstItem?.type === 'image' ? 'image' : 'file';
    startUploading(uploadType);

    try {
      for (const item of pendingMedia) {
        if (!item) continue;
        if (item.type === 'sticker' && item.url && !item.file) {
          out.push({
            mediaId: undefined,
            url: item.url,
            public_id: item.id,
            fileName: 'sticker',
            fileSize: 0,
            mimeType: 'image/png',
          });
          continue;
        }
        let file = item.file;
        // Recover file from object URL when file ref is missing (e.g. local file picker edge cases)
        if (!file && item.url && (item.type === 'gif' || item.type === 'image' || item.type === 'video')) {
          if (item.url.startsWith('blob:')) {
            try {
              const res = await fetch(item.url, { signal });
              if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
              const blob = await res.blob();
              const mime = item.type === 'gif' ? 'image/gif' : item.type === 'video' ? blob.type : blob.type || 'image/png';
              const ext = item.type === 'gif' ? 'gif' : item.type === 'video' ? (blob.type.split('/')[1] || 'mp4') : 'png';
              file = new File([blob], `media_${Date.now()}.${ext}`, { type: mime });
            } catch (e) {
              console.error('Failed to recover file from blob URL:', e);
              throw new Error('Could not read file. Please remove and re-add the file.');
            }
          }
        }
        if (!file) continue;

        const isGif = item.type === 'gif' || file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
        const isVideo = item.type === 'video' || file.type.startsWith('video/');
        const fileSize = file.size;
        const fileName = file.name || 'unknown file';
        const maxGif = MEDIA_LIMITS.MAX_GIF_SIZE;
        const maxVideo = MEDIA_LIMITS.MAX_VIDEO_SIZE;
        const maxImage = MEDIA_LIMITS.MAX_IMAGE_SIZE;

        if (fileSize === 0) {
          throw new Error(`File "${fileName}" is empty. Please choose another file.`);
        }
        if (isGif && fileSize > maxGif) {
          const maxMB = (maxGif / 1024 / 1024).toFixed(0);
          throw new Error(`GIF "${fileName}" is too large. Maximum size is ${maxMB}MB.`);
        }
        if (isVideo && fileSize > maxVideo) {
          const maxMB = (maxVideo / 1024 / 1024).toFixed(0);
          throw new Error(`Video "${fileName}" is too large. Maximum size is ${maxMB}MB.`);
        }
        if (!isGif && !isVideo && fileSize > maxImage) {
          const maxMB = (maxImage / 1024 / 1024).toFixed(0);
          throw new Error(`Image "${fileName}" is too large. Maximum size is ${maxMB}MB.`);
        }

        // Some local GIFs come from the picker with an empty/generic mime type.
        // Normalize before request-upload so the API validates them as image/gif.
        const normalizedFile =
          isGif && file.type !== 'image/gif'
            ? new File([file], file.name || `gif_${Date.now()}.gif`, {
                type: 'image/gif',
              })
            : file;

        const m = await uploadMediaFile(normalizedFile, { folder: 'chat', signal });
        out.push({
          mediaId: m.id || undefined,
          url: m.url,
          public_id: m.publicId,
          fileName: m.fileName,
          fileSize: m.fileSize,
          mimeType: m.mimeType,
        });
      }
      return out;
    } finally {
      stopUploading(uploadType);
      setUploading(false);
      uploadAbortRef.current = null;
    }
  }, [pendingMedia, startUploading, stopUploading]);

  const handleSubmit = async (e?: FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    stopTyping();
    const hasText = content.trim().length > 0;
    const hasMedia = pendingMedia.length > 0;
    if ((!hasText && !hasMedia) || disabled || sending) return;

    if (!canMentionEveryone && hasText && /@everyone|@here/i.test(content)) {
      setUploadError('You need MENTION_EVERYONE permission to mention @everyone or @here');
      return;
    }

    if (hasText && content.trim().startsWith('/') && serverId) {
      setSending(true);
      setUploadError(null);
      setSlashInfo(null);
      try {
        const response = await apiPost<{ success: boolean; executed: string }>(
          '/api/commands/execute',
          { serverId, command: content.trim() }
        );
        if (response.success) {
          setSlashInfo(`Command executed: /${response.executed}`);
          setContent('');
          setPendingMedia((prev) => {
            prev.forEach((p) => p.url && URL.revokeObjectURL(p.url));
            return [];
          });
          onCancelReply?.();
          return;
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to execute slash command';
        setUploadError(errorMessage);
        return;
      } finally {
        setSending(false);
      }
    }

    setSending(true);
    setUploadError(null);
    try {
      let media: MediaPayload | undefined;
      if (hasMedia) {
        media = await uploadMedia();
        if (media.length === 0) {
          throw new Error('No valid media to send. Please remove and re-add the file(s).');
        }
      }
      onSendMessage(hasText ? content.trim() : ' ', replyTo?.id ?? null, media);
      setContent('');
      setPendingMedia((prev) => {
        prev.forEach((p) => p.url && URL.revokeObjectURL(p.url));
        return [];
      });
      onCancelReply?.();
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (err) {
      console.error('Send failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message. Please try again.';
      setUploadError(errorMessage);
      // Show error to user
      alert(errorMessage);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionState && mentionOptions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionState((s) => (s ? { ...s, selectedIndex: (s.selectedIndex + 1) % mentionOptions.length } : null));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionState((s) =>
          s ? { ...s, selectedIndex: (s.selectedIndex - 1 + mentionOptions.length) % mentionOptions.length } : null
        );
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        applyMention(mentionOptions[mentionState.selectedIndex]!);
        return;
      }
      if (e.key === 'Escape') {
        setMentionState(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const applyMention = useCallback(
    (option: MentionOption) => {
      const ta = textareaRef.current;
      if (!ta || !mentionState) return;
      const prefixLen = mentionState.prefix === '@&' ? 2 : 1;
      const rest = content.slice(mentionState.start);
      const tokenMatch = rest.match(/^@&?[a-zA-Z0-9_\u0400-\u04FF]*/);
      const tokenLen = tokenMatch ? tokenMatch[0].length : prefixLen + mentionState.query.length;
      const end = mentionState.start + tokenLen;
      const before = content.slice(0, mentionState.start);
      const after = content.slice(end);
      const newContent = before + option.insertText + ' ' + after;
      setContent(newContent);
      setMentionState(null);
      setTimeout(() => {
        ta.focus();
        const pos = mentionState.start + option.insertText.length + 1;
        ta.setSelectionRange(pos, pos);
        ta.style.height = 'auto';
        ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
      }, 0);
    },
    [content, mentionState]
  );

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setUploadError(null);
    const newContent = e.target.value;
    setContent(newContent);
    if (newContent.length > 0) {
      startTyping();
    } else {
      stopTyping();
    }
    const ta = e.target;
    const cursor = ta.selectionStart ?? 0;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;

    const ctx = getMentionContext(newContent, cursor);
    if (ctx && (mentionMembers.length > 0 || mentionRoles.length > 0 || (ctx.prefix === '@' && canMentionEveryone))) {
      setMentionState({ ...ctx, selectedIndex: 0 });
    } else {
      setMentionState(null);
    }
  };

  const canSend = !disabled && !sending && !uploading && (content.trim().length > 0 || pendingMedia.length > 0);

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex flex-col bg-bg-secondary border-t border-border-primary relative',
        isDragging && 'ring-2 ring-green-primary ring-offset-2 ring-offset-bg-secondary'
      )}
    >
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-green-primary/10 flex items-center justify-center pointer-events-none">
          <div className="bg-bg-tertiary border-2 border-dashed border-green-primary rounded-lg px-8 py-6">
            <p className="text-green-primary font-medium text-lg">Drop files here</p>
          </div>
        </div>
      )}

      {replyTo && (
        <div className="px-4 pt-2 pb-1 flex items-center gap-2 bg-bg-tertiary border-b border-border-primary">
          <div className="flex-1 text-sm text-text-muted truncate">
            <span className="text-green-primary font-medium">Replying to {replyTo.user.name}</span>
            <span className="ml-2">
              {replyTo.content.length > 50
                ? replyTo.content.slice(0, 50) + '...'
                : replyTo.content}
            </span>
          </div>
          {onCancelReply && (
            <button
              type="button"
              onClick={onCancelReply}
              className="p-1 text-text-muted hover:text-text-primary transition-colors shrink-0"
              title="Cancel reply"
              aria-label="Cancel reply"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      )}

      <MediaPreview items={pendingMedia} onRemove={removeMedia} />

      {uploadError && (
        <div className="px-4 py-2 bg-danger/10 border-t border-danger/20">
          <p className="text-danger text-sm">{uploadError}</p>
        </div>
      )}
      {slashInfo && (
        <div className="px-4 py-2 bg-green-primary/10 border-t border-green-primary/20">
          <p className="text-green-primary text-sm">{slashInfo}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-2 p-4">
        {/* Left buttons */}
        <div className="flex shrink-0 gap-1">
          {canAttachFiles && (
            <div className="relative">
              <button
                ref={mediaButtonRef}
                type="button"
                onClick={() => {
                  setShowMediaPicker((v) => !v);
                  setShowEmoji(false);
                }}
                className={cn(
                  'p-2 rounded-md transition-colors',
                  'text-text-secondary hover:text-green-primary hover:bg-bg-hover',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-primary',
                  showMediaPicker && 'bg-bg-hover text-green-primary'
                )}
                title="Attach"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
              {showMediaPicker && (
                <MediaPickerPopover
                  anchorRef={mediaButtonRef}
                  onFiles={(files) => {
                    addFiles(files);
                    setShowMediaPicker(false);
                  }}
                  onClose={() => setShowMediaPicker(false)}
                />
              )}
            </div>
          )}

          <div className="relative">
            <button
              ref={emojiButtonRef}
              type="button"
              onClick={() => {
                setShowEmoji((v) => !v);
                setShowMediaPicker(false);
              }}
              className={cn(
                'p-2 rounded-md transition-colors',
                'text-text-secondary hover:text-green-primary hover:bg-bg-hover',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-primary',
                showEmoji && 'bg-bg-hover text-green-primary'
              )}
              title="Emoji"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <line x1="9" y1="9" x2="9.01" y2="9" />
                <line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            </button>
            {showEmoji && (
              <EmojiPickerPopover
                anchorRef={emojiButtonRef}
                onSelect={(emojiOrUrl) => {
                  // If it's a URL (server emoji), add as image (not a GIF, so don't save to recent)
                  if (typeof emojiOrUrl === 'string' && emojiOrUrl.startsWith('http')) {
                    addGifUrl(emojiOrUrl, false);
                  } else {
                    // Regular emoji
                    setContent((c) => c + emojiOrUrl);
                  }
                  setShowEmoji(false);
                }}
                insertAtCursor={insertAtCursor}
                onClose={() => setShowEmoji(false)}
                serverId={serverId}
              />
            )}
            <button
              ref={gifButtonRef}
              type="button"
              onClick={() => {
                setShowGif((v) => !v);
                setShowMediaPicker(false);
                setShowEmoji(false);
                setShowStickers(false);
              }}
              className={cn(
                'p-2 rounded-md transition-colors',
                'text-text-secondary hover:text-green-primary hover:bg-bg-hover',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-primary',
                showGif && 'bg-bg-hover text-green-primary'
              )}
              title="GIF"
            >
              <span className="text-sm font-bold text-text-primary">GIF</span>
            </button>
            {showGif && (
              <GiphyPickerPopover
                anchorRef={gifButtonRef}
                onSelect={(url) => {
                  addGifUrl(url, true);
                  setShowGif(false);
                }}
                onClose={() => setShowGif(false)}
              />
            )}
            <button
              ref={stickerButtonRef}
              type="button"
              onClick={() => {
                setShowStickers((v) => !v);
                setShowMediaPicker(false);
                setShowEmoji(false);
                setShowGif(false);
              }}
              className={cn(
                'p-2 rounded-md transition-colors',
                'text-text-secondary hover:text-green-primary hover:bg-bg-hover',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-primary',
                showStickers && 'bg-bg-hover text-green-primary'
              )}
              title="Stickers"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z" />
                <path d="M15 3v6h6" />
                <path d="M10 16s.8 1 2 1c1.3 0 2-.8 2-2 0-1.2-.8-2-2-2-1.2 0-2 .8-2 2Z" />
              </svg>
            </button>
            {showStickers && (
              <StickerPickerPopover
                anchorRef={stickerButtonRef}
                onSelect={(stickerUrl) => {
                  addStickerUrl(stickerUrl);
                  setShowStickers(false);
                }}
                onClose={() => setShowStickers(false)}
                serverId={serverId}
              />
            )}
          </div>
        </div>

        {/* Textarea + mention popover */}
        <div className="flex-1 relative min-w-0 flex flex-col">
          {mentionState && mentionOptions.length > 0 && (
            <div
              ref={mentionListRef}
              className="absolute bottom-full left-0 right-0 mb-1 max-h-[220px] overflow-auto rounded-lg border border-border-primary bg-bg-tertiary shadow-lg z-50 py-1"
              role="listbox"
            >
              {mentionOptions.map((opt, i) => (
                <button
                  key={opt.type === 'everyone' ? 'everyone' : `${opt.type}-${opt.id}`}
                  type="button"
                  role="option"
                  aria-selected={i === mentionState.selectedIndex}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm transition-colors',
                    i === mentionState.selectedIndex ? 'bg-bg-hover text-text-primary' : 'text-text-secondary hover:bg-bg-hover',
                    opt.type === 'everyone' && 'text-amber-600 dark:text-amber-400',
                    opt.type === 'role' && 'text-purple-600 dark:text-purple-400'
                  )}
                  onClick={() => applyMention(opt)}
                >
                  {opt.type === 'user' && <span className="text-blue-500 dark:text-blue-400 font-medium">{opt.label}</span>}
                  {opt.type === 'role' && <span>{opt.label}</span>}
                  {opt.type === 'everyone' && <span>{opt.label}</span>}
                </button>
              ))}
            </div>
          )}
          {!mentionState && slashHints.length > 0 && content.trim().startsWith('/') && (
            <div className="absolute bottom-full left-0 right-0 mb-1 max-h-[220px] overflow-auto rounded-lg border border-border-primary bg-bg-tertiary shadow-lg z-50 py-1">
              {slashHints.map((cmd) => (
                <button
                  key={cmd.name}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm transition-colors text-text-secondary hover:bg-bg-hover"
                  onClick={() => setContent(`${cmd.name} `)}
                >
                  <span className="text-text-primary font-medium">{cmd.name}</span>
                  <span className="text-text-muted ml-2">{cmd.description}</span>
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            disabled={disabled}
            maxLength={MESSAGE_LIMITS.MAX_CONTENT_LENGTH}
            rows={1}
            className={cn(
              'w-full px-4 py-3 rounded-lg resize-none',
              'bg-bg-primary border border-border-primary',
              'text-text-primary placeholder:text-text-muted',
              'focus:outline-none focus:border-green-primary focus:ring-2 focus:ring-green-primary/40',
              'hover:border-border-secondary',
              'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-bg-tertiary',
              'min-h-[44px] max-h-[200px]'
            )}
            style={{ minHeight: 44, maxHeight: 200 }}
          />
          {content.length > MESSAGE_LIMITS.MAX_CONTENT_LENGTH * 0.875 && (
            <div
              className={cn(
                'absolute right-3 bottom-2 text-xs',
                content.length > MESSAGE_LIMITS.MAX_CONTENT_LENGTH * 0.975 ? 'text-danger' : 'text-text-muted'
              )}
            >
              {content.length}/{MESSAGE_LIMITS.MAX_CONTENT_LENGTH}
            </div>
          )}
        </div>

        {/* Send button */}
        <button
          type="submit"
          disabled={!canSend}
          title={uploading ? 'Uploading…' : 'Send'}
          className={cn(
            'shrink-0 p-2.5 rounded-lg transition-all',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-primary',
            canSend
              ? 'bg-green-primary text-bg-primary hover:bg-green-hover active:bg-green-active shadow-lg shadow-green-primary/20'
              : 'bg-bg-tertiary text-text-muted cursor-not-allowed'
          )}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>

    </div>
  );
}
