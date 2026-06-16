/**
 * Client instance ID management
 * 
 * Each browser tab/session gets a unique ID stored in sessionStorage.
 * This ensures that multiple tabs or different accounts on the same PC
 * are treated as separate LiveKit participants.
 */

export function getClientInstanceId(): string {
  if (typeof window === 'undefined') {
    throw new Error('getClientInstanceId can only be called on the client side');
  }

  let id = sessionStorage.getItem('clientInstanceId');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('clientInstanceId', id);
  }
  return id;
}
