/**
 * Invalidate permission cache: INCR server:permVersion:${serverId}.
 * Versioned keys perm:...:v${version} and channelsView:...:v${version} become stale; no mass delete.
 */
import { incrPermVersion } from './permVersion';

/**
 * Invalidate permission cache for a user in a server (roles/leave).
 */
export async function invalidatePermissionCacheByUser(
  serverId: string,
  _userId: string
): Promise<void> {
  try {
    await incrPermVersion(serverId);
  } catch (err) {
    console.warn('[invalidatePermissionCacheByUser]', err);
  }
}

/**
 * Invalidate permission cache for a channel (overwrites change).
 */
export async function invalidatePermissionCacheByChannel(
  serverId: string,
  _channelId: string
): Promise<void> {
  try {
    await incrPermVersion(serverId);
  } catch (err) {
    console.warn('[invalidatePermissionCacheByChannel]', err);
  }
}

/**
 * Invalidate all permission cache for a server (role reorder, role update, owner, etc.).
 */
export async function invalidatePermissionCacheForServer(serverId: string): Promise<void> {
  try {
    await incrPermVersion(serverId);
  } catch (err) {
    console.warn('[invalidatePermissionCacheForServer]', err);
  }
}
