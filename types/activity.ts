/**
 * Activity indicators: typing, uploading, etc.
 */

export const ACTIVITY_TYPES = [
  'typing',
  'uploading:image',
  'uploading:video',
  'uploading:file',
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export interface UserActivity {
  userId: string;
  userName: string;
  channelId: string;
  activityType: ActivityType;
  startedAt: string;
}

export interface ActivityEvent {
  event: 'activity:start' | 'activity:stop';
  userId: string;
  userName: string;
  channelId: string;
  activityType: ActivityType;
  timestamp: string;
}

export interface UserActivityState {
  userId: string;
  userName: string;
  activityType: ActivityType;
  startedAt: number;
}

export interface ChannelActivityState {
  channelId: string;
  activities: Map<string, UserActivityState>;
}
