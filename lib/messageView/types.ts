/**
 * Unified message model for UI. UI does not know if the message is from DM or Server.
 */
export interface MessageViewMessage {
  id: string;
  content: string;
  createdAt: Date;
  editedAt: Date | null;

  author: {
    id: string;
    username: string;
    avatar: string | null;
    roleColor: string | null;
    roleName: string | null;
  };

  replyTo?: {
    messageId: string;
    authorUsername: string;
    roleColor: string | null;
    content: string;
  };

  reactions: {
    emoji: string;
    count: number;
    reactedByMe: boolean;
  }[];

  /** Optional: unified MediaFile[] from MessageDTO */
  mediaFiles?: import('@/lib/media/types').MediaFile[];

  /** Optional: link embeds (first URL in content) */
  embeds?: import('@/lib/messages/dto').Embed[];

  /** Optional: resolved mentions (user, role, everyone). From DTO; UI does not parse. */
  mentions?: import('@/lib/messages/dto').MessageMention[];

  /** Set on optimistic message; used to replace with server message when realtime arrives */
  clientGeneratedId?: string;
}

/** Participant model for ParticipantList. Parent passes DM or Server list. */
export interface MessageViewParticipant {
  id: string;
  username: string;
  avatar: string | null;
  roleColor?: string | null;
  roleName?: string | null;
}
