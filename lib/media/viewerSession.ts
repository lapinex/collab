export type MediaViewerSession = {
  url: string;
  type: 'image' | 'gif' | 'video';
  fileName?: string;
};

const MEDIA_VIEWER_SESSION_KEY = 'collab:media-viewer:session';

export function readMediaViewerSession(): MediaViewerSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(MEDIA_VIEWER_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MediaViewerSession>;
    if (!parsed || typeof parsed.url !== 'string') return null;
    if (parsed.type !== 'image' && parsed.type !== 'gif' && parsed.type !== 'video') return null;
    return {
      url: parsed.url,
      type: parsed.type,
      fileName: typeof parsed.fileName === 'string' ? parsed.fileName : undefined,
    };
  } catch {
    return null;
  }
}

export function saveMediaViewerSession(state: MediaViewerSession): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(MEDIA_VIEWER_SESSION_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
}

export function clearMediaViewerSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(MEDIA_VIEWER_SESSION_KEY);
  } catch {
    // ignore storage errors
  }
}
