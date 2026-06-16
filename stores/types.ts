export type EntityMap<T> = Record<string, T>;

export interface EntityState<T> {
  byId: EntityMap<T>;
  ids: string[];
}

export interface OrderedEntityState<T> extends EntityState<T> {}

export interface PresenceEntityState<T> {
  byId: EntityMap<T>;
  onlineIds: string[];
  lastUpdated: Record<string, number>;
}

export interface VoiceChannelEntityState<T> {
  participantsById: EntityMap<T>;
  participantIds: string[];
  sidToParticipantId: Record<string, string>;
  userIdToParticipantId: Record<string, string>;
}
