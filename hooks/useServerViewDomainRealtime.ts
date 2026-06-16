'use client';

/**
 * TODO: Implement serverView/sv:* realtime producers on backend.
 * No API publishes to realtime:serverView:${serverId} or realtime:sv:channels|roles|members|emojis|webhooks:${serverId}.
 * Gateway must handle these topics and broadcast to clients.
 * Add publishRealtime in: channels, roles, members, emojis, webhooks API routes.
 * See: docs/server-view-realtime-contract.md
 */
export function useServerViewDomainRealtime(_serverId: string | null) {
  // No-op until backend producers exist
}
