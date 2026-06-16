'use client';

import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api-client';

export interface UserSettingsResponse {
  theme: string;
  settings: {
    language: string;
    location: string | null;
    autoTranslate: boolean;
    preferredLanguage: string;
    notificationsEnabled: boolean;
    notificationsSound: boolean;
    notificationsMentions: boolean;
    privacyShowEmail: boolean;
    privacyShowOnlineStatus: boolean;
  };
}

async function fetchUserSettings(): Promise<UserSettingsResponse> {
  return apiGet<UserSettingsResponse>('/api/users/settings');
}

export function useUserSettings() {
  const query = useQuery({
    queryKey: ['user-settings'],
    queryFn: fetchUserSettings,
    staleTime: 60_000,
  });

  return {
    settings: query.data?.settings ?? null,
    theme: query.data?.theme ?? 'collab',
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
