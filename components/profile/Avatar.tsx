'use client';

import * as React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'offline';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  status?: PresenceStatus;
  showStatus?: boolean;
  onClick?: () => void;
  className?: string;
}

const sizeClasses = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-lg',
};

const sizePx: Record<typeof sizeClasses extends Record<infer K, string> ? K : never, number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 48,
  xl: 64,
};

const statusSizeClasses = {
  xs: 'w-2 h-2 right-0 bottom-0',
  sm: 'w-2.5 h-2.5 right-0 bottom-0',
  md: 'w-3 h-3 right-0 bottom-0',
  lg: 'w-3.5 h-3.5 right-0.5 bottom-0.5',
  xl: 'w-4 h-4 right-1 bottom-1',
};

const statusColors: Record<PresenceStatus, string> = {
  online: 'bg-status-online',
  idle: 'bg-status-idle',
  dnd: 'bg-status-dnd',
  offline: 'bg-status-offline',
};

export function Avatar({
  src,
  name,
  size = 'md',
  status = 'offline',
  showStatus = false,
  onClick,
  className,
}: AvatarProps) {
  const isClickable = !!onClick;
  const initial = name.charAt(0).toUpperCase();
  const [imgError, setImgError] = React.useState(false);
  React.useEffect(() => {
    setImgError(false);
  }, [src]);
  const showImg = src && !imgError;

  return (
    <div
      className={cn(
        'relative inline-flex flex-shrink-0',
        isClickable && 'cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      {/* Avatar circle */}
      <div
        className={cn(
          'rounded-full flex items-center justify-center font-semibold',
          'transition-all duration-150 ease-in-out',
          sizeClasses[size],
          
          // Background
          src ? '' : 'bg-bg-tertiary text-text-names',
          
          // Online indicator ring
          status === 'online' && showStatus && 'ring-2 ring-status-online',
          
          // Hover effects for clickable avatars
          isClickable && [
            'hover:ring-2 hover:ring-green-primary/50',
            'hover:shadow-[0_0_12px_rgba(118,185,0,0.3)]',
          ],
        )}
      >
        {showImg ? (
          <Image
            src={src}
            alt={name}
            width={sizePx[size]}
            height={sizePx[size]}
            sizes={`${sizePx[size]}px`}
            className="w-full h-full rounded-full object-cover"
            unoptimized={src.startsWith('data:') || src.startsWith('/media/')}
            onError={() => setImgError(true)}
          />
        ) : (
          <span>{initial}</span>
        )}
      </div>

      {/* Status indicator dot */}
      {showStatus && (
        <div
          className={cn(
            'absolute rounded-full border-2 border-bg-primary',
            statusSizeClasses[size],
            statusColors[status],
          )}
        />
      )}
    </div>
  );
}
