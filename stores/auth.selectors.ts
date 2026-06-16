import { useAuthStore } from '@/stores/auth-store';

export type AuthStoreState = ReturnType<typeof useAuthStore.getState>;

export const selectUser = (state: AuthStoreState) => state.user;
export const selectIsAuthenticated = (state: AuthStoreState) => state.isAuthenticated;
export const selectAuthLoading = (state: AuthStoreState) => state.isLoading;
export const selectAuthError = (state: AuthStoreState) => state.error;
export const selectPresenceStatus = (state: AuthStoreState) => state.presenceStatus;

export const selectUserId = (state: AuthStoreState) => state.user?.id ?? null;
export const selectUserName = (state: AuthStoreState) => state.user?.name ?? null;
export const selectUserAvatar = (state: AuthStoreState) => state.user?.avatarUrl ?? null;

export const selectSetUser = (state: AuthStoreState) => state.setUser;
export const selectSetLoading = (state: AuthStoreState) => state.setLoading;
export const selectSetError = (state: AuthStoreState) => state.setError;
export const selectUpdateProfile = (state: AuthStoreState) => state.updateProfile;
export const selectUpdatePresence = (state: AuthStoreState) => state.updatePresence;
export const selectLogout = (state: AuthStoreState) => state.logout;
