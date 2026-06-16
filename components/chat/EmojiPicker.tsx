'use client';

import { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface Emoji {
  emoji: string;
  name: string;
}

const EMOJIS: Emoji[] = [
  { emoji: '👍', name: 'thumbs up' },
  { emoji: '👎', name: 'thumbs down' },
  { emoji: '❤️', name: 'heart' },
  { emoji: '😂', name: 'laughing' },
  { emoji: '😮', name: 'surprised' },
  { emoji: '😢', name: 'sad' },
  { emoji: '😡', name: 'angry' },
  { emoji: '🔥', name: 'fire' },
  { emoji: '⭐', name: 'star' },
  { emoji: '🎉', name: 'party' },
  { emoji: '✅', name: 'check' },
  { emoji: '❌', name: 'cross' },
  { emoji: '💯', name: 'hundred' },
  { emoji: '🙏', name: 'thanks' },
  { emoji: '👏', name: 'clap' },
  { emoji: '🤔', name: 'thinking' },
  { emoji: '😍', name: 'love' },
  { emoji: '😎', name: 'cool' },
  { emoji: '🤯', name: 'mind blown' },
  { emoji: '😭', name: 'crying' },
  { emoji: '👀', name: 'eyes' },
  { emoji: '💪', name: 'strong' },
  { emoji: '🙌', name: 'raise hands' },
  { emoji: '✌️', name: 'peace' },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
  className?: string;
}

export function EmojiPicker({ onSelect, onClose, anchorRef, className }: EmojiPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        pickerRef.current &&
        !pickerRef.current.contains(target) &&
        !anchorRef?.current?.contains(target)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, anchorRef]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div
      ref={pickerRef}
      className={cn(
        'absolute bottom-full left-0 mb-1 z-50',
        'bg-bg-tertiary border border-border-primary rounded-lg shadow-lg p-2',
        'max-h-48 overflow-y-auto',
        className
      )}
    >
      <div className="grid grid-cols-6 gap-1">
        {EMOJIS.map((e) => (
          <button
            key={e.emoji}
            type="button"
            onClick={() => {
              onSelect(e.emoji);
              onClose();
            }}
            className={cn(
              'w-8 h-8 flex items-center justify-center rounded-md',
              'hover:bg-bg-hover transition-colors text-lg'
            )}
            title={e.name}
          >
            {e.emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
