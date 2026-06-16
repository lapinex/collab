'use client';

import { useState, useRef, useCallback, memo, useEffect } from 'react';
import Image from 'next/image';
import type { MessageViewMessage } from '@/lib/messageView/types';
import type { MessageMention } from '@/lib/messages/dto';
import { formatTime } from '@/lib/utils';
import { Avatar } from '@/components/profile/Avatar';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ReactionPicker } from '@/components/reactions/ReactionPicker';
import { ContextMenu } from '@/components/context-menu/ContextMenu';
import { useUserContextMenu } from '@/hooks/useUserContextMenu';
import { useUserProfileContext } from '@/contexts/UserProfileContext';
import type { ProfileAnchor } from '@/contexts/UserProfileContext';
import { Reply, Pencil, Smile, MoreHorizontal, Trash2 } from 'lucide-react';
import { EmbedCard } from '@/components/message/EmbedCard';
import { MediaViewerModal } from '@/components/media/MediaViewerModal';
import { MessageMedia } from '@/components/media/MessageMedia';
import type { MediaFile } from '@/lib/media/types';
import { motion } from 'framer-motion';
import {
  readMediaViewerSession,
  saveMediaViewerSession,
  clearMediaViewerSession,
} from '@/lib/media/viewerSession';

function MessageItemMedia({ files }: { files: MediaFile[] }) {
  const [viewer, setViewer] = useState<{ url: string; type: 'image' | 'gif' | 'video' } | null>(null);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

  useEffect(() => {
    const saved = readMediaViewerSession();
    if (!saved) return;
    const existsInMessage = files.some((file) => file.url === saved.url);
    if (existsInMessage) {
      setViewer({ url: saved.url, type: saved.type });
    }
  }, [files]);

  useEffect(() => {
    if (viewer) {
      saveMediaViewerSession(viewer);
    } else {
      clearMediaViewerSession();
    }
  }, [viewer]);

  return (
    <>
      <div className="mt-2 flex flex-col gap-2">
        {files.map((file) => {
          const url = file.url;
          if (!url) return null;
          const isImage = file.type === 'image' || file.type === 'gif' || file.type === 'sticker';
          const isVideo = file.type === 'video';
          const mediaType = file.type === 'gif' ? 'gif' : isVideo ? 'video' : 'image';
          if (isImage) {
            if (imageErrors.has(file.id)) {
              return (
                <a
                  key={file.id}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 p-4 rounded-lg border border-border-primary bg-bg-tertiary text-text-secondary hover:bg-bg-quaternary text-sm max-w-[480px] min-h-[200px]"
                >
                  <span className="text-xl opacity-70">🖼️</span>
                  <span>Image failed to load — open link</span>
                </a>
              );
            }
            return (
              <button
                key={file.id}
                type="button"
                onClick={() => setViewer({ url, type: mediaType })}
                className="rounded-lg overflow-hidden border border-border-primary hover:opacity-90 transition-opacity text-left w-full max-w-[480px] relative min-h-[200px] aspect-video bg-bg-tertiary"
              >
                <Image
                  src={url}
                  alt=""
                  fill
                  className="rounded-lg object-contain"
                  sizes="(max-width: 480px) 100vw, 480px"
                  unoptimized
                  onError={() => setImageErrors((prev) => new Set(prev).add(file.id))}
                />
              </button>
            );
          }
          if (isVideo) {
            return (
              <button
                key={file.id}
                type="button"
                onClick={() => setViewer({ url, type: 'video' })}
                className="rounded-lg overflow-hidden border border-border-primary hover:opacity-90 transition-opacity block w-full max-w-[480px]"
              >
                <video
                  src={url}
                  controls
                  className="rounded-lg w-full max-w-[480px] max-h-[400px] min-h-[240px] object-contain"
                  onClick={(e) => e.stopPropagation()}
                />
              </button>
            );
          }
          return (
            <a
              key={file.id}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-blue-400 underline"
            >
              {file.mimeType ? `Download (${file.mimeType})` : 'Download'}
            </a>
          );
        })}
      </div>
      {viewer && (
        <MediaViewerModal
          url={viewer.url}
          type={viewer.type}
          onClose={() => setViewer(null)}
        />
      )}
    </>
  );
}

/** Matches @everyone, @&role, @user. Lookahead for end (no \\b) so Cyrillic nicknames match. */
const MENTION_CHAR = '[a-zA-Z0-9_\u0400-\u04FF]';
const MENTION_END = '(?=[^a-zA-Z0-9_\u0400-\u04FF]|$)';
const MENTION_DISPLAY_RE = new RegExp(
  `@(?:everyone\\b|&${MENTION_CHAR}{2,100}${MENTION_END}|${MENTION_CHAR}{2,100}${MENTION_END})`,
  'gi'
);

/** Renders message content with mention spans (highlighted, clickable). Role in content is @&Name. Fallback: when no mentions (e.g. optimistic), still style @/@& so no white flash. */
function renderContentWithMentions(
  content: string,
  mentions: MessageMention[] | undefined,
  onUserClick?: (userId: string) => void,
  onRoleClick?: (roleId: string) => void
): React.ReactNode {
  const needleToMention = new Map<string, MessageMention>();
  if (mentions?.length) {
    for (const m of mentions) {
      const needle =
        m.type === 'everyone' ? '@everyone' : m.type === 'role' && m.label ? `@&${m.label}` : m.label ? `@${m.label}` : null;
      if (needle) needleToMention.set(needle.toLowerCase(), m);
    }
  }

  const spans: Array<{ start: number; end: number; mention: MessageMention | null }> = [];
  MENTION_DISPLAY_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MENTION_DISPLAY_RE.exec(content)) !== null) {
    const needle = match[0];
    const m = needleToMention.get(needle.toLowerCase()) ?? null;
    spans.push({ start: match.index, end: match.index + needle.length, mention: m });
  }
  spans.sort((a, b) => a.start - b.start);
  let lastEnd = 0;
  const segments: Array<{ type: 'text' | 'mention'; start: number; end: number; mention?: MessageMention | null }> = [];
  for (const span of spans) {
    if (span.start < lastEnd) continue;
    if (span.start > lastEnd) segments.push({ type: 'text', start: lastEnd, end: span.start });
    segments.push({ type: 'mention', start: span.start, end: span.end, mention: span.mention });
    lastEnd = span.end;
  }
  if (lastEnd < content.length) segments.push({ type: 'text', start: lastEnd, end: content.length });

  return segments.map((seg, i) => {
    if (seg.type === 'text') return <span key={i}>{content.slice(seg.start, seg.end)}</span>;
    const m = seg.mention;
    const text = content.slice(seg.start, seg.end);
    const isRole = text.startsWith('@&');
    if (m?.type === 'user' && m.id) {
      return (
        <button
          key={i}
          type="button"
          role="button"
          tabIndex={0}
          data-user-profile-trigger
          data-user-id={m.id}
          className="text-blue-500 dark:text-blue-400 font-medium cursor-pointer hover:underline bg-transparent border-none p-0 inline text-left align-baseline focus:outline-none focus:underline"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onUserClick?.(m.id);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onUserClick?.(m.id);
            }
          }}
        >
          {text}
        </button>
      );
    }
    if (m?.type === 'role' || isRole) {
      return (
        <span
          key={i}
          role="button"
          tabIndex={0}
          className="text-purple-500 dark:text-purple-400 font-medium cursor-pointer hover:underline"
          onClick={() => m?.type === 'role' && onRoleClick?.(m.id)}
          onKeyDown={(e) => e.key === 'Enter' && m?.type === 'role' && onRoleClick?.(m.id)}
        >
          {text}
        </span>
      );
    }
    if (m?.type === 'everyone') {
      return (
        <span key={i} className="text-amber-500 dark:text-amber-400 font-semibold">
          {text}
        </span>
      );
    }
    return (
      <span key={i} className="text-blue-500 dark:text-blue-400 font-medium">
        {text}
      </span>
    );
  });
}

interface MessageItemProps {
  message: MessageViewMessage;
  isNewMessage?: boolean;
  isOwnMessage?: boolean;
  isEditing?: boolean;
  onReaction?: (emoji: string) => void;
  onReply?: () => void;
  onEdit?: () => void;
  onSaveEdit?: (content: string) => void;
  onCancelEdit?: () => void;
  onAvatarClick?: (userId: string, anchor?: ProfileAnchor) => void;
  currentUserId?: string;
  serverId?: string; // Only for context menu (role management), not for data
  canAddReactions?: boolean;
  canManageRoles?: boolean;
  canKick?: boolean;
  canBan?: boolean;
  canManageMessages?: boolean;
  onDeleteMessage?: () => void;
}

function MessageItemComponent({
  message,
  isNewMessage = false,
  isOwnMessage = false,
  isEditing = false,
  onReaction,
  onReply,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onAvatarClick,
  currentUserId,
  serverId,
  canAddReactions = true,
  canManageRoles = false,
  canKick = false,
  canBan = false,
  canManageMessages = false,
  onDeleteMessage,
}: MessageItemProps) {
  const [editContent, setEditContent] = useState(message.content);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [reactionPickerPos, setReactionPickerPos] = useState<{ x: number; y: number } | null>(null);
  const [reactionAnimations, setReactionAnimations] = useState<Set<string>>(new Set());
  const messageRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLDivElement>(null);
  const { openUserProfile } = useUserProfileContext();

  const { handleContextMenu: handleAvatarContextMenu, contextMenu: avatarContextMenu } = useUserContextMenu({
    userId: message.author.id,
    serverId,
    currentUserId,
    canManageRoles,
    canKick,
    canBan,
    onProfileClick: () => {
      const rect = avatarRef.current?.getBoundingClientRect();
      if (rect) onAvatarClick?.(message.author.id, { x: rect.right, y: rect.top + rect.height / 2, side: 'right' });
      else onAvatarClick?.(message.author.id);
    },
  });

  const reactions = message.reactions ?? [];

  const handleReaction = useCallback(
    (emoji: string) => {
      setReactionAnimations((prev) => new Set(prev).add(emoji));
      setTimeout(() => {
        setReactionAnimations((prev) => {
          const next = new Set(prev);
          next.delete(emoji);
          return next;
        });
      }, 300);
      onReaction?.(emoji);
      setReactionPickerPos(null);
    },
    [onReaction]
  );

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  };

  const openReactionPicker = () => {
    if (!messageRef.current) return;
    const rect = messageRef.current.getBoundingClientRect();
    setReactionPickerPos({ x: rect.right - 200, y: rect.top - 10 });
    setContextMenuPos(null);
  };

  const contextMenuItems = [
    {
      label: 'Add reaction',
      icon: <span className="text-base">😀</span>,
      onClick: openReactionPicker,
    },
    {
      label: 'Reply',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 10 4 15 9 20" />
          <path d="M20 4v7a4 4 0 0 1-4 4H4" />
        </svg>
      ),
      onClick: () => {
        onReply?.();
        setContextMenuPos(null);
      },
    },
    ...(isOwnMessage
      ? [
          {
            label: 'Edit',
            icon: (
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            ),
            onClick: () => {
              onEdit?.();
              setContextMenuPos(null);
            },
          },
        ]
      : []),
    ...((isOwnMessage || canManageMessages) && onDeleteMessage
      ? [
          {
            label: 'Delete message',
            icon: <Trash2 className="w-4 h-4" />,
            variant: 'danger' as const,
            onClick: () => {
              onDeleteMessage();
              setContextMenuPos(null);
            },
          },
        ]
      : []),
  ];

  const content = (
    <div
      ref={messageRef}
      className={cn(
        'message-item group relative flex gap-3 px-4 py-2',
        'transition-colors duration-150',
        'hover:bg-bg-tertiary/90',
        isOwnMessage && 'bg-bg-tertiary/50'
      )}
      data-testid="message-item"
      data-server-id={serverId ?? undefined}
      onContextMenu={handleContextMenu}
    >
      <div className="flex-shrink-0 flex items-start gap-2 mt-0.5">
        <div
          className="flex-shrink-0 cursor-pointer"
          ref={avatarRef}
          onContextMenu={handleAvatarContextMenu}
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            onAvatarClick?.(message.author.id, { x: rect.right, y: rect.top + rect.height / 2, side: 'right' });
          }}
        >
          <Avatar
            src={message.author.avatar}
            name={message.author.username}
            size="md"
            showStatus={false}
          />
        </div>
        {avatarContextMenu}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <button
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              onAvatarClick?.(message.author.id, { x: rect.right, y: rect.top + rect.height / 2, side: 'right' });
            }}
            className={cn(
              'font-semibold hover:underline cursor-pointer',
              message.author.roleColor ? '' : 'text-green-primary'
            )}
            style={message.author.roleColor ? { color: message.author.roleColor } : undefined}
          >
            {message.author.username}
          </button>
          <span className="text-xs text-text-muted">{formatTime(message.createdAt)}</span>
          {message.editedAt && <span className="text-xs text-text-muted">(edited)</span>}
        </div>

        {message.replyTo && (
          <div className="mt-1 mb-1 pl-3 border-l-2 border-green-primary/50 text-sm text-text-muted">
            <span
              className="font-medium"
              style={message.replyTo.roleColor ? { color: message.replyTo.roleColor } : { color: 'var(--green-primary)' }}
            >
              {message.replyTo.authorUsername}
            </span>
            <span className="ml-1">
              {message.replyTo.content.length > 50
                ? message.replyTo.content.slice(0, 50) + '...'
                : message.replyTo.content}
            </span>
          </div>
        )}

        {isEditing ? (
          <div className="mt-1">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-bg-primary border border-border-primary text-text-primary resize-none focus:outline-none focus:border-green-primary focus:ring-2 focus:ring-green-primary/40"
              rows={3}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                  onSaveEdit?.(editContent);
                } else if (e.key === 'Escape') {
                  onCancelEdit?.();
                }
              }}
            />
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => onSaveEdit?.(editContent)} disabled={!editContent.trim()}>
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditContent(message.content);
                  onCancelEdit?.();
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            {(message.content != null && message.content.trim() !== '') && (
              <div className="mt-1 text-text-primary break-words whitespace-pre-wrap">
                {renderContentWithMentions(
                  message.content,
                  message.mentions,
                  (userId) => openUserProfile(userId, serverId ?? null, null),
                  (_roleId) => {}
                )}
              </div>
            )}
            {message.mediaFiles && message.mediaFiles.length > 0 && (
              serverId ? (
                <div className="min-h-[120px]">
                  <MessageItemMedia files={message.mediaFiles} />
                </div>
              ) : (
                <MessageMedia files={message.mediaFiles} />
              )
            )}
            {message.embeds && message.embeds.length > 0 && (
              <div className="mt-2 flex flex-col gap-2">
                {message.embeds.map((embed, i) => (
                  <EmbedCard key={`${embed.url}-${i}`} embed={embed} />
                ))}
              </div>
            )}
          </>
        )}


        {reactions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={() => handleReaction(r.emoji)}
                className={cn(
                  'flex items-center gap-1.5 px-2 py-1 rounded-md text-sm font-medium',
                  'bg-bg-quaternary hover:bg-bg-hover',
                  'border border-border-primary hover:border-green-primary',
                  'transition-all duration-150',
                  r.reactedByMe && 'bg-green-primary/20 border-green-primary',
                  reactionAnimations.has(r.emoji) && 'animate-reaction-pop'
                )}
              >
                <span className="text-base">{r.emoji}</span>
                <span className="text-text-secondary text-xs">{r.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {!isEditing && (
        <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none">
          <div className="flex items-center gap-1 bg-bg-secondary border border-border-primary rounded-md shadow-lg p-1 pointer-events-auto">
            {onReply && (
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onReply();
                }}
                className="h-7 w-7 rounded hover:bg-bg-hover"
                title="Reply"
                aria-label="Reply"
              >
                <Reply className="w-4 h-4 text-text-secondary" />
              </Button>
            )}
            {isOwnMessage && onEdit && (
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="h-7 w-7 rounded hover:bg-bg-hover"
                title="Edit"
                aria-label="Edit"
              >
                <Pencil className="w-4 h-4 text-text-secondary" />
              </Button>
            )}
            {onReaction && canAddReactions && (
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  openReactionPicker();
                }}
                className="h-7 w-7 rounded hover:bg-bg-hover"
                title="Add reaction"
                aria-label="Add reaction"
              >
                <Smile className="w-4 h-4 text-text-secondary" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                if (messageRef.current) {
                  const rect = messageRef.current.getBoundingClientRect();
                  setContextMenuPos({ x: rect.right - 150, y: rect.top + 20 });
                }
              }}
              className="h-7 w-7 rounded hover:bg-bg-hover"
              title="More options"
              aria-label="More options"
            >
              <MoreHorizontal className="w-4 h-4 text-text-secondary" />
            </Button>
          </div>
        </div>
      )}

      {contextMenuPos && (
        <ContextMenu
          items={contextMenuItems}
          position={contextMenuPos}
          onClose={() => setContextMenuPos(null)}
        />
      )}

      {reactionPickerPos && onReaction && (
        <ReactionPicker
          position={reactionPickerPos}
          onSelect={handleReaction}
          onClose={() => setReactionPickerPos(null)}
        />
      )}
    </div>
  );

  if (isNewMessage) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.12 }}
      >
        {content}
      </motion.div>
    );
  }
  return content;
}

export const MessageItem = memo(MessageItemComponent);
