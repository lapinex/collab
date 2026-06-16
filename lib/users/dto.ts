export type UserProfileDTO = {
  id: string;
  username: string;
  avatarUrl: string | null;

  presence: 'online' | 'idle' | 'dnd' | 'offline';

  mutualServersCount: number;
  mutualFriendsCount: number;

  isFriend: boolean;
  incomingFriendRequest: boolean;
  outgoingFriendRequest: boolean;
  friendRequestId?: string | null;

  isBlocked: boolean;

  rolesInServer?: {
    roleId: string;
    roleName: string;
    roleColor: string | null;
    position: number;
  }[];

  /** Nickname on server (when serverId provided). */
  serverNickname?: string | null;
};
