'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useClickOutside } from '@/hooks/useClickOutside';

interface Emoji {
  emoji: string;
  name: string;
}

const COMMON_EMOJIS: Emoji[] = [
  { emoji: '👍', name: 'thumbs up' },
  { emoji: '👎', name: 'thumbs down' },
  { emoji: '❤️', name: 'heart' },
  { emoji: '😂', name: 'laughing' },
  { emoji: '😮', name: 'surprised' },
  { emoji: '😢', name: 'sad' },
  { emoji: '🔥', name: 'fire' },
  { emoji: '⭐', name: 'star' },
  { emoji: '🎉', name: 'party' },
  { emoji: '✅', name: 'check' },
  { emoji: '❌', name: 'cross' },
  { emoji: '💯', name: 'hundred' },
];

interface ReactionPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  position: { x: number; y: number };
}

export function ReactionPicker({ onSelect, onClose, position }: ReactionPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!pickerRef.current || !mounted) return;

    const rect = pickerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let x = position.x;
    let y = position.y;

    if (x + rect.width > viewportWidth) {
      x = viewportWidth - rect.width - 10;
    }
    if (x < 0) {
      x = 10;
    }
    if (y + rect.height > viewportHeight) {
      y = viewportHeight - rect.height - 10;
    }
    if (y < 0) {
      y = 10;
    }

    setAdjustedPosition({ x, y });
  }, [position, mounted]);

  useClickOutside(pickerRef, () => onClose(), mounted);

  useEffect(() => {
    if (!mounted) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose, mounted]);

  if (!mounted) return null;

  const content = (
    <div
      ref={pickerRef}
      role="dialog"
      aria-label="Reaction picker"
      className="fixed z-50 bg-bg-secondary border border-border-primary rounded-lg shadow-lg p-2 animate-slide-in-bottom"
      style={{
        left: `${adjustedPosition.x}px`,
        top: `${adjustedPosition.y}px`,
      }}
    >
      <div className="grid grid-cols-6 gap-1">
        {COMMON_EMOJIS.map((emoji) => (
          <button
            key={emoji.emoji}
            type="button"
            onClick={() => {
              onSelect(emoji.emoji);
              onClose();
            }}
            className={cn(
              'w-8 h-8 flex items-center justify-center rounded-md',
              'hover:bg-bg-hover transition-colors',
              'text-lg focus:outline-none focus:ring-2 focus:ring-green-primary/40'
            )}
            title={emoji.name}
            aria-label={`React with ${emoji.name}`}
          >
            {emoji.emoji}
          </button>
        ))}
      </div>
    </div>
  );

  return typeof window !== 'undefined' ? createPortal(content, document.body) : null;
}

interface ReactionDisplayProps {
  reactions: Array<{
    emoji: string;
    count: number;
    users: Array<{ id: string; name: string }>;
    hasReacted: boolean;
  }>;
  onReactionClick: (emoji: string) => void;
  onReactionHover?: (emoji: string, users: Array<{ id: string; name: string }>) => void;
}

export function ReactionDisplay({
  reactions,
  onReactionClick,
  onReactionHover,
}: ReactionDisplayProps) {
  if (reactions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          onClick={() => onReactionClick(reaction.emoji)}
          onMouseEnter={() => onReactionHover?.(reaction.emoji, reaction.users)}
          className={cn(
            'px-2 py-1 rounded-md text-xs flex items-center gap-1',
            'border border-border-primary',
            'hover:bg-bg-hover transition-colors',
            reaction.hasReacted && 'bg-green-primary/20 border-green-primary'
          )}
        >
          <span>{reaction.emoji}</span>
          <span className="text-text-secondary">{reaction.count}</span>
        </button>
      ))}
    </div>
  );
}
