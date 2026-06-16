export interface Message {
  id: string;
  channelId: string;
  userId: string;
  content: string;
  replyToMessageId: string | null;
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageEdit {
  id: string;
  messageId: string;
  content: string;
  editedAt: Date;
}

export interface Reaction {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: Date;
}

export interface WebSocketMessage {
  v: 1;
  type: string;
  payload: Record<string, unknown>;
  nonce?: string;
  requestId?: string;
}

