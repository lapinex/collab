'use client';

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';

/** 'left' = popover to left of anchor (sidebar), 'right' = popover to right (chat) */
export type ProfileAnchorSide = 'left' | 'right';

export interface ProfileAnchor {
  x: number;
  y: number;
  side: ProfileAnchorSide;
}

interface UserProfileState {
  userId: string | null;
  serverId: string | null;
  anchor: ProfileAnchor | null;
}

interface UserProfileContextValue {
  openUserProfile: (userId: string, serverId?: string | null, anchor?: ProfileAnchor | null) => void;
  closeUserProfile: () => void;
  userId: string | null;
  serverId: string | null;
  anchor: ProfileAnchor | null;
  isOpen: boolean;
}

const UserProfileContext = createContext<UserProfileContextValue | null>(null);

/** Click on element with data-user-profile-trigger and data-user-id opens profile (works after reload/hydration). */
function useProfileClickDelegate(openUserProfile: (userId: string, serverId?: string | null, anchor?: ProfileAnchor | null) => void) {
  const openRef = useRef(openUserProfile);
  openRef.current = openUserProfile;

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const start: Element | null = target instanceof Element ? target : target.parentElement;
      const el = start?.closest?.('[data-user-profile-trigger][data-user-id]');
      if (!el) return;
      const userId = el.getAttribute('data-user-id');
      if (!userId || userId === 'undefined') return;
      const serverEl = el.closest?.('[data-server-id]');
      const serverId = serverEl?.getAttribute('data-server-id') || undefined;
      e.stopPropagation();
      openRef.current(userId, serverId || null, null);
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, []);
}

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UserProfileState>({
    userId: null,
    serverId: null,
    anchor: null,
  });

  const openUserProfile = useCallback((userId: string, serverId?: string | null, anchor?: ProfileAnchor | null) => {
    setState({ userId, serverId: serverId ?? null, anchor: anchor ?? null });
  }, []);

  const closeUserProfile = useCallback(() => {
    setState({ userId: null, serverId: null, anchor: null });
  }, []);

  useProfileClickDelegate(openUserProfile);

  return (
    <UserProfileContext.Provider
      value={{
        openUserProfile,
        closeUserProfile,
        userId: state.userId,
        serverId: state.serverId,
        anchor: state.anchor,
        isOpen: !!state.userId,
      }}
    >
      {children}
    </UserProfileContext.Provider>
  );
}

export function useUserProfileContext() {
  const ctx = useContext(UserProfileContext);
  if (!ctx) {
    throw new Error('useUserProfileContext must be used within UserProfileProvider');
  }
  return ctx;
}
