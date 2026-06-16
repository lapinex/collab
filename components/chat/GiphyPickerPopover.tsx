'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useClickOutside } from '@/hooks/useClickOutside';
import { clientEnv } from '@/lib/env/clientEnv';

interface GiphyPickerPopoverProps {
  onSelect: (gifUrl: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  className?: string;
}

const PICKER_WIDTH = 320;
const PICKER_HEIGHT = 360;
const GIPHY_API = 'https://api.giphy.com/v1/gifs';
const RECENT_GIFS_KEY = 'collab_recent_gifs';
const RECENT_GIFS_MAX = 24;

type GiphyItem = { id: string; images: { fixed_height?: { url: string }; original?: { url: string } }; title: string };
type RecentGif = { url: string; title?: string };

function getRecentGifs(): RecentGif[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_GIFS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is RecentGif => x && typeof x === 'object' && typeof (x as RecentGif).url === 'string').slice(0, RECENT_GIFS_MAX);
  } catch {
    return [];
  }
}

function addRecentGif(url: string, title?: string): void {
  if (typeof window === 'undefined') return;
  const recent = getRecentGifs();
  const next = [{ url, title }, ...recent.filter((r) => r.url !== url)].slice(0, RECENT_GIFS_MAX);
  try {
    localStorage.setItem(RECENT_GIFS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function GiphyPickerPopover({
  onSelect,
  onClose,
  anchorRef,
  className,
}: GiphyPickerPopoverProps) {
  const apiKey = clientEnv.giphyApiKey;
  const [searchInput, setSearchInput] = useState('');
  const [items, setItems] = useState<GiphyItem[]>([]);
  const [recentGifs, setRecentGifs] = useState<RecentGif[]>([]);
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mounted) setRecentGifs(getRecentGifs());
  }, [mounted]);

  const fetchGifs = useCallback(
    async (query: string) => {
      if (!apiKey) {
        setItems([]);
        return;
      }
      setLoading(true);
      try {
        const url = query.trim()
          ? `${GIPHY_API}/search?api_key=${apiKey}&q=${encodeURIComponent(query.trim())}&limit=20&rating=g`
          : `${GIPHY_API}/trending?api_key=${apiKey}&limit=20&rating=g`;
        const res = await fetch(url);
        const json = (await res.json()) as { data?: GiphyItem[] };
        setItems(json.data ?? []);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [apiKey]
  );

  useEffect(() => {
    const t = setTimeout(() => {
      fetchGifs(searchInput);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, fetchGifs]);

  useEffect(() => {
    if (!anchorRef?.current || !mounted) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const spacing = 8;
    let top = rect.bottom + spacing;
    if (top + PICKER_HEIGHT > vh - spacing) {
      top = Math.max(spacing, rect.top - PICKER_HEIGHT - spacing);
    }
    let left = rect.left + rect.width / 2 - PICKER_WIDTH / 2;
    if (left < spacing) left = spacing;
    if (left + PICKER_WIDTH > vw - spacing) left = vw - PICKER_WIDTH - spacing;
    setPosition({ top, left });
  }, [anchorRef, mounted]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useClickOutside(pickerRef, () => onClose(), mounted);
  useEffect(() => {
    if (!mounted) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose, mounted]);

  if (!mounted || !position) return null;

  const content = (
    <div
      ref={pickerRef}
      role="dialog"
      aria-label="GIF picker"
      className={cn(
        'fixed z-50 flex flex-col rounded-lg border border-border-primary bg-bg-tertiary shadow-xl overflow-hidden',
        className
      )}
      style={{ width: PICKER_WIDTH, height: PICKER_HEIGHT, top: position.top, left: position.left }}
    >
      <div className="p-2 border-b border-border-primary">
        <input
          type="text"
          placeholder="Search GIFs..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-bg-primary border border-border-primary text-text-primary placeholder:text-text-muted text-sm focus:outline-none focus:ring-2 focus:ring-green-primary"
        />
      </div>
      <div className="flex-1 overflow-auto p-2">
        {!apiKey ? (
          <div className="text-center text-sm text-text-muted py-8">
            Add <code className="text-xs">NEXT_PUBLIC_GIPHY_API_KEY</code> to enable GIFs.
          </div>
        ) : (
          <>
            {recentGifs.length > 0 && searchInput.trim() === '' && (
              <div className="mb-3">
                <div className="text-xs font-medium text-text-secondary mb-1.5">Recent</div>
                <div className="grid grid-cols-4 gap-1">
                  {recentGifs.slice(0, 8).map((r, i) => (
                    <button
                      key={`${r.url}-${i}`}
                      type="button"
                      className="relative aspect-square rounded overflow-hidden hover:ring-2 ring-green-primary focus:outline-none focus:ring-2 focus:ring-green-primary"
                      onClick={() => {
                        onSelect(r.url);
                        onClose();
                      }}
                    >
                      <Image src={r.url} alt={r.title ?? 'GIF'} fill className="object-cover" sizes="72px" unoptimized />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {loading ? (
              <div className="text-center text-sm text-text-muted py-8">Loading...</div>
            ) : items.length === 0 ? (
              <div className="text-center text-sm text-text-muted py-8">No GIFs found.</div>
            ) : (
              <div className="grid grid-cols-2 gap-1">
                {items.map((g) => {
                  const url = g.images?.fixed_height?.url ?? g.images?.original?.url ?? '';
                  if (!url) return null;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      className="relative aspect-square rounded overflow-hidden hover:ring-2 ring-green-primary focus:outline-none focus:ring-2 focus:ring-green-primary"
                      onClick={() => {
                        addRecentGif(url, g.title);
                        setRecentGifs(getRecentGifs());
                        onSelect(url);
                        onClose();
                      }}
                    >
                      <Image src={url} alt={g.title || 'GIF'} fill className="object-cover" sizes="120px" unoptimized />
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  return typeof window !== 'undefined' ? createPortal(content, document.body) : null;
}
