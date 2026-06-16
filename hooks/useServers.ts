'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useServersQuery } from './useServersQuery';

export function useServers() {
  const queryClient = useQueryClient();
  const query = useServersQuery();

  const servers = query.data?.servers ?? [];
  const isLoading = query.isLoading;
  const reload = useCallback(() => query.refetch(), [query]);

  const invalidateServers = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['servers'] });
  }, [queryClient]);

  return {
    servers,
    isLoading,
    reload,
    invalidateServers,
  };
}
