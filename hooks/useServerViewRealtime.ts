'use client';

/**
 * TODO: Implement serverView realtime producer on backend.
 * No API publishes to realtime:serverView:${serverId}.
 * Superseded by useServerViewDomainRealtime (sv:* slices) when backend is ready.
 * See: docs/server-view-realtime-contract.md
 */
export function useServerViewRealtime(_serverId: string | null) {
  // No-op until backend producer exists
}
