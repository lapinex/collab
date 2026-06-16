'use client';

import { useEffect, useRef } from 'react';

const MAX_PRELOAD = 12;

/**
 * Preload media (image) URLs when they become available (e.g. from messages).
 * Uses Image() to trigger browser fetch; SW will cache when registered.
 */
export function useMediaPreload(urls: (string | null | undefined)[], enabled = true) {
  const preloaded = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;

    const valid = urls
      .filter((u): u is string => !!u && u.startsWith('http'))
      .filter((u) => !preloaded.current.has(u))
      .slice(0, MAX_PRELOAD);

    valid.forEach((url) => {
      preloaded.current.add(url);
      const img = new Image();
      img.src = url;
    });
  }, [enabled, urls.join('\n')]);
}
