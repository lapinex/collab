export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  theme: 'collab';
  createdAt: Date;
  updatedAt: Date;
}

export interface UserSettings {
  userId: string;
  theme: 'collab';
  language: string;
  notifications: {
    enabled: boolean;
    sound: boolean;
    mentions: boolean;
  };
  privacy: {
    showEmail: boolean;
    showOnlineStatus: boolean;
  };
}

export interface Presence {
  userId: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  customStatus: string | null;
  lastSeen: Date;
}
