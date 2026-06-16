export const MESSAGE_TAGS = {
  servers: 'servers',
  channels: 'channels',
  messages: 'messages',
} as const;

export function messagesInfiniteQueryKey(channelId: string | null) {
  return [MESSAGE_TAGS.messages, 'infinite', channelId] as const;
}

export function serversListQueryKey() {
  return [MESSAGE_TAGS.servers] as const;
}

export function channelsListQueryKey(serverId: string | null) {
  return [MESSAGE_TAGS.channels, serverId] as const;
}

export type RevalidateTag = typeof MESSAGE_TAGS[keyof typeof MESSAGE_TAGS];
