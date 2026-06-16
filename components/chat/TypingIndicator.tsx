'use client';

import { useActivityStore } from '@/stores/activity-store';
import type { ActivityType } from '@/types/activity';
import { useEffect, useState } from 'react';

const STALE_MS = 12000;

interface TypingIndicatorProps {
  channelId: string;
  currentUserId: string;
}

function getActivityText(activityType: ActivityType): string {
  switch (activityType) {
    case 'typing':
      return 'печатает';
    case 'uploading:image':
      return 'отправляет фото';
    case 'uploading:video':
      return 'отправляет видео';
    case 'uploading:file':
      return 'отправляет файл';
    default:
      return 'печатает';
  }
}

export function TypingIndicator({ channelId, currentUserId }: TypingIndicatorProps) {
  const getActivities = useActivityStore((state) => state.getActivitiesForChannel);
  const [activities, setActivities] = useState(() =>
    getActivities(channelId).filter((a) => a.userId !== currentUserId)
  );

  useEffect(() => {
    const interval = setInterval(() => {
      const current = getActivities(channelId).filter((a) => a.userId !== currentUserId);
      const now = Date.now();
      const fresh = current.filter((a) => now - a.startedAt < STALE_MS);
      setActivities(fresh);
    }, 1000);
    return () => clearInterval(interval);
  }, [channelId, currentUserId, getActivities]);

  if (activities.length === 0) return null;

  const grouped = activities.reduce((acc, activity) => {
    const type = activity.activityType;
    if (!acc[type]) acc[type] = [];
    acc[type].push(activity.userName);
    return acc;
  }, {} as Record<ActivityType, string[]>);

  const lines = (Object.entries(grouped) as [ActivityType, string[]][]).map(([type, names]) => {
    const activityText = getActivityText(type);
    if (names.length === 1) return `${names[0]} ${activityText}`;
    if (names.length === 2) return `${names[0]} и ${names[1]} ${activityText}`;
    if (names.length === 3) return `${names[0]}, ${names[1]} и ${names[2]} ${activityText}`;
    return `${names[0]}, ${names[1]} и еще ${names.length - 2} ${activityText}`;
  });

  return (
    <div className="px-4 py-2 text-sm text-text-muted flex items-center gap-2">
      <span>{lines.join(' • ')}</span>
      <span className="inline-flex gap-1">
        <span
          className="w-1.5 h-1.5 bg-text-muted/70 rounded-full animate-bounce"
          style={{ animationDelay: '0ms', animationDuration: '0.6s' }}
        />
        <span
          className="w-1.5 h-1.5 bg-text-muted/70 rounded-full animate-bounce"
          style={{ animationDelay: '150ms', animationDuration: '0.6s' }}
        />
        <span
          className="w-1.5 h-1.5 bg-text-muted/70 rounded-full animate-bounce"
          style={{ animationDelay: '300ms', animationDuration: '0.6s' }}
        />
      </span>
    </div>
  );
}
