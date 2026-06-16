'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/types/auth';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  presenceStatus?: 'online' | 'offline' | 'away' | 'dnd' | 'invisible';
  
  // Actions
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  updateProfile: (updates: Partial<User>) => void;
  updatePresence: (status: 'online' | 'offline' | 'away' | 'dnd' | 'invisible') => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
          error: null,
        }),

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error }),

      updateProfile: (updates) =>
        set((state) => {
          if (!state.user) return state;
          return {
            user: {
              ...state.user,
              ...updates,
            },
          };
        }),

      updatePresence: (status) => set({ presenceStatus: status }),

      logout: () =>
        set({
          user: null,
          isAuthenticated: false,
          error: null,
          presenceStatus: undefined,
        }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
