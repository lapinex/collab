'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet } from '@/lib/api-client';
import type { UserProfileDTO } from '@/lib/users/dto';

const FIVE_MINUTES = 5 * 60 * 1000;

export function userProfileQueryKey(userId: string | null, serverId?: string | null) {
  if (!userId) return ['user-profile', null, null] as const;
  return ['user-profile', userId, serverId ?? null] as const;
}

export function useUserProfile(userId: string | null, serverId?: string | null) {
  return useQuery({
    queryKey: userProfileQueryKey(userId, serverId),
    queryFn: async (): Promise<UserProfileDTO> => {
      if (!userId) throw new Error('userId required');
      const params = serverId ? `?serverId=${encodeURIComponent(serverId)}` : '';
      const data = await apiGet<UserProfileDTO>(`/api/users/${userId}/profile${params}`);
      return data;
    },
    enabled: !!userId,
    staleTime: FIVE_MINUTES,
    gcTime: FIVE_MINUTES,
  });
}

export function useInvalidateUserProfile() {
  const queryClient = useQueryClient();
  return (userId: string, serverId?: string | null) => {
    queryClient.invalidateQueries({ queryKey: userProfileQueryKey(userId, serverId) });
  };
}
