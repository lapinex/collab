'use client';

/**
 * Re-exports from navigation-store for backward compatibility.
 * New code should use useNavigationStore from stores/navigation-store.
 */
import {
  useNavigationStore,
  getCurrentOpenChannelId,
  type NavigationActiveTab,
} from '@/stores/navigation-store';

export type AppActiveTab = NavigationActiveTab;

export { getCurrentOpenChannelId };

export const useAppStore = useNavigationStore;
