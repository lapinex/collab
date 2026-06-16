'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { selectIsAuthenticated } from '@/stores/auth.selectors';
import { apiGet, apiPost } from '@/lib/api-client';
import type { DMChannel } from '@/types/dm';

/** DM channels list and create. Messages use the same contour as server (GET /api/messages + useMessages + entities). */
export function useDMs() {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  const { data: channels = [], isLoading, refetch } = useQuery<DMChannel[]>({
    queryKey: ['dm-channels'],
    queryFn: async () => {
      const response = await apiGet<{ channels: DMChannel[] }>('/api/dms/channels');
      return response.channels ?? [];
    },
    enabled: !!isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  const createChannelMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiPost<{ channel: DMChannel }>('/api/dms/channels', {
        userId,
      });
      return response.channel;
    },
    onSuccess: (newChannel) => {
      queryClient.setQueryData<DMChannel[]>(['dm-channels'], (old = []) => {
        if (old.some((ch) => ch.id === newChannel.id)) return old;
        return [...old, newChannel];
      });
    },
  });

  return {
    channels,
    isLoading,
    createChannel: createChannelMutation.mutateAsync,
    refetch,
  };
}
