'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useClickOutside } from '@/hooks/useClickOutside';
import { useServerEmojis } from '@/hooks/serverView';

interface Emoji {
  emoji: string;
  name: string;
  category: string;
  url?: string; // For server emojis
}

const EMOJI_CATEGORIES = {
  'Smileys & People': ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓'],
  'Gestures & Body': ['👋', '🤚', '🖐', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁', '👅', '👄'],
  'Animals & Nature': ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🕷', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🦬', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🦮', '🐕‍🦺', '🐈', '🐈‍⬛', '🪶', '🦅', '🦆', '🦢', '🦩', '🦚', '🦜', '🐓', '🦃', '🦤', '🦉'],
  'Food & Drink': ['🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶', '🌽', '🥕', '🥔', '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🥞', '🥓', '🥩', '🍗', '🍖', '🦴', '🌭', '🍔', '🍟', '🍕', '🥪', '🥙', '🌮', '🌯', '🥗', '🥘', '🥫', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🦪', '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🥮', '🍢', '🍡', '🍧', '🍨', '🍦', '🥧', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍿', '🍩', '🍪', '🌰', '🥜', '🍯', '🥛', '🍼', '☕️', '🍵', '🧃', '🥤', '🧋', '🍶', '🍺', '🍻', '🥂', '🍷', '🥃', '🍸', '🍹', '🧉', '🍾', '🧊'],
  'Activities': ['⚽️', '🏀', '🏈', '⚾️', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🥅', '⛳️', '🏹', '🎣', '🥊', '🥋', '🎽', '🛹', '🛷', '⛸', '🥌', '🎿', '⛷', '🏂', '🏋️', '🤼', '🤸', '🤺', '⛹️', '🤾', '🏌️', '🏇', '🧘', '🏄', '🏊', '🤽', '🚣', '🧗', '🚵', '🚴', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖', '🏵', '🎗', '🎫', '🎟', '🎪', '🤹', '🎭', '🩰', '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🎷', '🎺', '🎸', '🪕', '🎻', '🎲', '♟', '🎯', '🎳', '🎮', '🎰', '🧩'],
  'Objects': ['⌚️', '📱', '📲', '💻', '⌨️', '🖥', '🖨', '🖱', '🖲', '🕹', '🗜', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📽', '🎞', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙', '🎚', '🎛', '⏱', '⏲', '⏰', '🕰', '⌛️', '⏳', '📡', '🔋', '🔌', '💡', '🔦', '🕯', '🧯', '🛢', '💸', '💵', '💴', '💶', '💷', '💰', '💳', '💎', '⚖️', '🧰', '🔧', '🔨', '⚒', '🛠', '⛏', '🔩', '⚙️', '🧱', '⛓', '🧲', '🔫', '💣', '🧨', '🔪', '🗡', '⚔️', '🛡', '🚬', '⚰️', '⚱️', '🏺', '🔮', '📿', '🧿', '💈', '⚗️', '🔭', '🔬', '🕳', '💊', '💉', '🩸', '🧬', '🦠', '🧫', '🧪', '🌡', '🧹', '🧺', '🧻', '🚽', '🚿', '🛁', '🛀', '🧼', '🪒', '🧽', '🧴', '🛎', '🔑', '🗝', '🚪', '🪑', '🛋', '🛏', '🛌', '🧸', '🖼', '🛍', '🛒', '🎁', '🎈', '🎏', '🎀', '🪄', '🪅', '🪆', '🎊', '🎉', '🎎', '🏮', '🎐', '🧧', '✉️', '📩', '📨', '📧', '💌', '📥', '📤', '📦', '🏷', '🪧', '📪', '📫', '📬', '📭', '📮', '📯', '📜', '📃', '📄', '📑', '🧾', '📊', '📈', '📉', '🗒', '🗓', '📆', '📅', '🗑', '📇', '🗃', '🗳', '🗄', '📋', '📁', '📂', '🗂', '🗞', '📰', '📓', '📔', '📒', '📕', '📗', '📘', '📙', '📚', '📖', '🔖', '🧷', '🔗', '📎', '🖇', '📐', '📏', '🧮', '📌', '📍', '✂️', '🖊', '🖋', '✒️', '🖌', '🖍', '📝', '✏️', '🔍', '🔎', '🔏', '🔐', '🔒', '🔓'],
  'Symbols': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈️', '♉️', '♊️', '♋️', '♌️', '♍️', '♎️', '♏️', '♐️', '♑️', '♒️', '♓', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳', '🈶', '🈚️', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲', '🅰️', '🅱️', '🆎', '🆑', '🅾️', '🆘', '❌', '⭕️', '🛑', '⛔️', '📛', '🚫', '💯', '💢', '♨️', '🚷', '🚯', '🚳', '🚱', '🔞', '📵', '🚭', '❗️', '❓', '❕', '❔', '‼️', '⁉️', '🔅', '🔆', '〽️', '⚠️', '🚸', '🔱', '⚜️', '🔰', '♻️', '✅', '🈯️', '💹', '❇️', '✳️', '❎', '🌐', '💠', 'Ⓜ️', '🌀', '💤', '🏧', '🚾', '♿️', '🅿️', '🈳', '🈂️', '🛂', '🛃', '🛄', '🛅', '🚹', '🚺', '🚼', '🚻', '🚮', '🎦', '📶', '🈁', '🔣', 'ℹ️', '🔤', '🔡', '🔠', '🆖', '🆗', '🆙', '🆒', '🆕', '🆓', '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '🔢', '#️⃣', '*️⃣', '⏏️', '▶️', '⏸', '⏯', '⏹', '⏺', '⏭', '⏮', '⏩', '⏪', '⏫', '⏬', '◀️', '🔼', '🔽', '➡️', '⬅️', '⬆️', '⬇️', '↗️', '↘️', '↙️', '↖️', '↕️', '↔️', '↪️', '↩️', '⤴️', '⤵️', '🔀', '🔁', '🔂', '🔄', '🔃', '🎵', '🎶', '➕', '➖', '➗', '✖️', '💲', '💱', '™️', '©️', '®️', '〰️', '➰', '➿', '🔚', '🔙', '🔛', '🔜', '🔝'],
};

const allEmojis: Emoji[] = Object.entries(EMOJI_CATEGORIES).flatMap(([category, emojis]) =>
  emojis.map((emoji) => ({ emoji, name: '', category }))
);

interface EmojiPickerPopoverProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  insertAtCursor?: (text: string) => void;
  className?: string;
  serverId?: string; // For server emojis
}

const PICKER_WIDTH = 352;
const PICKER_HEIGHT = 400;
const SEARCH_HEIGHT = 48;
const CATEGORIES_HEIGHT = 40;
const EMOJI_GRID_HEIGHT = PICKER_HEIGHT - SEARCH_HEIGHT - CATEGORIES_HEIGHT;

export function EmojiPickerPopover({
  onSelect,
  onClose,
  anchorRef,
  insertAtCursor,
  className,
  serverId,
}: EmojiPickerPopoverProps) {
  const [search, setSearch] = useState('');
  const { data } = useServerEmojis(serverId ?? null);
  const serverEmojis = useMemo(
    () => (serverId ? (data ?? []) : []),
    [serverId, data]
  );
  
  // Add "Server" category if we have server emojis
  const categoriesWithServer = useMemo(() => {
    const baseCategories = Object.keys(EMOJI_CATEGORIES);
    if (serverEmojis.length > 0) {
      return [...baseCategories, 'Server'];
    }
    return baseCategories;
  }, [serverEmojis.length]);
  
  const [selectedCategory, setSelectedCategory] = useState<string>(categoriesWithServer[0] || '');
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const categoryScrollPositions = useRef<Map<string, number>>(new Map());

  // Save scroll position when category changes
  const saveScrollPosition = useCallback(() => {
    if (scrollRef.current && selectedCategory) {
      categoryScrollPositions.current.set(selectedCategory, scrollRef.current.scrollTop);
    }
  }, [selectedCategory]);

  // Restore scroll position when category changes
  const restoreScrollPosition = useCallback(() => {
    if (scrollRef.current && selectedCategory) {
      const saved = categoryScrollPositions.current.get(selectedCategory);
      if (saved !== undefined) {
        scrollRef.current.scrollTop = saved;
      } else {
        scrollRef.current.scrollTop = 0;
      }
    }
  }, [selectedCategory]);

  // Calculate position based on anchor
  useEffect(() => {
    if (!anchorRef.current || !mounted) return;

    const anchorRect = anchorRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const spacing = 8;

    let top: number;
    let left: number;

    // Try to position above (bottom-full)
    const spaceAbove = anchorRect.top;
    const spaceBelow = viewportHeight - anchorRect.bottom;

    if (spaceAbove >= PICKER_HEIGHT + spacing) {
      // Position above
      top = anchorRect.top - PICKER_HEIGHT - spacing;
    } else if (spaceBelow >= PICKER_HEIGHT + spacing) {
      // Position below
      top = anchorRect.bottom + spacing;
    } else {
      // Center vertically if neither fits
      top = Math.max(spacing, Math.min(viewportHeight - PICKER_HEIGHT - spacing, (viewportHeight - PICKER_HEIGHT) / 2));
    }

    // Horizontal alignment
    left = anchorRect.left;
    if (left + PICKER_WIDTH > viewportWidth) {
      left = viewportWidth - PICKER_WIDTH - spacing;
    }
    if (left < spacing) {
      left = spacing;
    }

    setPosition({ top, left });
  }, [anchorRef, mounted]);

  // Mount check for portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Click outside handler
  useClickOutside(pickerRef, () => onClose(), mounted);

  // Escape key handler
  useEffect(() => {
    if (!mounted) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose, mounted]);

  // Handle category change
  const handleCategoryChange = useCallback(
    (cat: string) => {
      saveScrollPosition();
      setSelectedCategory(cat);
      setTimeout(() => restoreScrollPosition(), 0);
    },
    [saveScrollPosition, restoreScrollPosition]
  );

  const filteredEmojis = useMemo(() => {
    if (selectedCategory === 'Server') {
      // Show server emojis
      if (!search.trim()) {
        return serverEmojis.map((e) => ({
          emoji: `<img src="${e.url}" alt="${e.name}" className="w-6 h-6" />`,
          name: e.name,
          category: 'Server',
          url: e.url,
        }));
      }
      const lower = search.toLowerCase();
      return serverEmojis
        .filter((e) => e.name.toLowerCase().includes(lower))
        .map((e) => ({
          emoji: `<img src="${e.url}" alt="${e.name}" className="w-6 h-6" />`,
          name: e.name,
          category: 'Server',
          url: e.url,
        }));
    }
    
    if (!search.trim()) {
      return allEmojis.filter((e) => e.category === selectedCategory);
    }
    const lower = search.toLowerCase();
    return allEmojis.filter((e) => e.emoji.includes(lower) || e.name.toLowerCase().includes(lower));
  }, [search, selectedCategory, serverEmojis]);

  const handleSelect = useCallback(
    (emoji: string | { url: string; name: string }) => {
      if (typeof emoji === 'object' && emoji.url) {
        // Server emoji - return URL for image insertion
        onSelect(emoji.url);
      } else {
        // Regular emoji
        if (insertAtCursor) {
          insertAtCursor(emoji as string);
        } else {
          onSelect(emoji as string);
        }
      }
      onClose();
    },
    [insertAtCursor, onSelect, onClose]
  );

  if (!mounted || !position) return null;

  const content = (
    <div
      ref={pickerRef}
      role="dialog"
      aria-label="Emoji picker"
      aria-modal="false"
      className={cn(
        'fixed z-50',
        'bg-bg-tertiary border border-border-primary rounded-lg shadow-xl',
        'flex flex-col',
        'animate-slide-in-bottom',
        className
      )}
      style={{
        width: PICKER_WIDTH,
        height: PICKER_HEIGHT,
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      {/* Search - Fixed height */}
      <div className="h-[48px] p-2 border-b border-border-primary flex-shrink-0">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search emojis..."
          className="w-full h-full px-3 rounded-md bg-bg-primary border border-border-primary text-text-primary placeholder:text-text-muted text-sm focus:outline-none focus:border-green-primary focus:ring-2 focus:ring-green-primary/40"
          autoFocus
        />
      </div>

      {/* Categories - Fixed height */}
      {!search && (
        <div className="h-[40px] flex gap-1 p-2 border-b border-border-primary overflow-x-auto flex-shrink-0">
          {categoriesWithServer.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => handleCategoryChange(cat)}
              className={cn(
                'px-2 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0',
                selectedCategory === cat
                  ? 'bg-green-primary/20 text-green-primary'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
              )}
            >
              {cat.split(' ')[0]}
            </button>
          ))}
        </div>
      )}

      {/* Emoji Grid - Fixed height, scrollable */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-2"
        style={{ height: EMOJI_GRID_HEIGHT }}
      >
        <div className="grid grid-cols-8 gap-1">
          {filteredEmojis.map((e, i) => {
            const isServerEmoji = selectedCategory === 'Server' && 'url' in e;
            return (
              <button
                key={isServerEmoji ? `${e.name}-${i}` : `${e.emoji}-${i}`}
                type="button"
                onClick={() => {
                  if (isServerEmoji && 'url' in e && e.url) {
                    // For server emojis, pass URL and name
                    handleSelect({ url: e.url, name: e.name });
                  } else {
                    handleSelect(e.emoji);
                  }
                }}
                className="w-9 h-9 flex items-center justify-center rounded-md hover:bg-bg-hover transition-colors text-lg focus:outline-none focus:ring-2 focus:ring-green-primary/40"
                title={e.name || e.emoji}
                aria-label={e.name || `Emoji ${e.emoji}`}
              >
                {isServerEmoji && 'url' in e && e.url ? (
                  <Image src={e.url} alt={e.name ?? ''} width={24} height={24} className="w-6 h-6 object-contain" unoptimized={e.url.startsWith('data:') || e.url.startsWith('/media/')} />
                ) : (
                  e.emoji
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return typeof window !== 'undefined' ? createPortal(content, document.body) : null;
}
