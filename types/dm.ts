export interface DMChannel {
  id: string;
  otherUser: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
  lastMessage: {
    id: string;
    content: string;
    createdAt: string;
    userId: string;
    user: {
      id: string;
      name: string;
      avatarUrl: string | null;
    };
  } | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DMMessage {
  id: string;
  channelId: string;
  userId: string;
  content: string;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
  replyToId?: string | null;
  reactions: unknown[];
  /** Media attached to the message (unified MediaFile). */
  mediaFiles?: import('@/lib/media/types').MediaFile[];
}
