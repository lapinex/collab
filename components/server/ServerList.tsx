'use client';

import { useState, memo, useCallback, useMemo } from 'react';
import Image from 'next/image';
import type { Server } from '@/types/server';
import { cn } from '@/lib/utils';
import { JoinCreateServerModal } from '@/components/modals/JoinCreateServerModal';
import { ServerBadge } from '@/components/notifications/ServerBadge';
import { useBadgeStore } from '@/stores/badge-store';
import { selectServerBadge } from '@/stores/badge.selectors';

interface ServerListProps {
  servers: Server[];
  selectedServerId?: string;
  onSelectServer: (serverId: string) => void;
  onServerCreated?: (server: Server) => void;
  onServerJoined?: (server: Server) => void;
  onUserSettingsClick?: () => void;
}

interface ServerIconProps {
  server: Server;
  isSelected: boolean;
  onSelectServer: (serverId: string) => void;
}

const ServerIcon = memo(function ServerIcon({ server, isSelected, onSelectServer }: ServerIconProps) {
  const badgeSelector = useMemo(() => selectServerBadge(server.id), [server.id]);
  const badge = useBadgeStore(badgeSelector);
  const unread = badge?.unread ?? 0;
  const mentions = badge?.mentions ?? 0;
  const hasPreview = unread > 0 || mentions > 0;

  const handleClick = useCallback(() => {
    onSelectServer(server.id);
  }, [server.id, onSelectServer]);

  return (
    <div className="relative group">
      <div
        className={cn(
          'absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-full transition-all duration-200',
          isSelected ? 'h-10 bg-green-primary' : 'h-0 group-hover:h-5 bg-text-secondary'
        )}
      />
      <div className="relative inline-block ml-1">
        <button
          onClick={handleClick}
          className={cn(
            'w-12 h-12 rounded-full flex items-center justify-center',
            'transition-all duration-200 ease-in-out',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-primary',
            mentions > 0 && 'animate-mention-pulse',
            isSelected
              ? ['bg-green-primary text-bg-primary', 'rounded-2xl']
              : [
                  'bg-bg-quaternary text-text-secondary',
                  'hover:bg-green-primary hover:text-bg-primary',
                  'hover:rounded-2xl',
                  'hover:shadow-[0_0_12px_rgba(118,185,0,0.3)]',
                ]
          )}
          title={server.name}
        >
          {server.iconUrl ? (
            <Image
              src={server.iconUrl}
              alt={server.name}
              width={48}
              height={48}
              sizes="48px"
              className={cn(
                'w-full h-full object-cover',
                isSelected ? 'rounded-2xl' : 'rounded-full group-hover:rounded-2xl'
              )}
              unoptimized={server.iconUrl.startsWith('data:') || server.iconUrl.startsWith('/media/')}
            />
          ) : (
            <span className="text-lg font-bold">{server.name.charAt(0).toUpperCase()}</span>
          )}
        </button>
        <ServerBadge unread={unread} mentions={mentions} />
      </div>
      {hasPreview ? (
        <div
          className={cn(
            'absolute left-full ml-4 top-1/2 -translate-y-1/2 z-50 pointer-events-none',
            'min-w-[200px] px-3 py-2 rounded-lg shadow-xl',
            'bg-surface-panel/95 border border-border-default backdrop-blur-md',
            'opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0',
            'transition-[opacity,transform] duration-150 ease-out delay-[120ms]'
          )}
        >
          <div className="text-sm font-semibold text-text-heading whitespace-nowrap truncate">
            {server.name}
          </div>
          <div className="text-xs text-text-muted mt-0.5 whitespace-nowrap">
            {unread > 0 ? `${unread} unread` : ''}
            {unread > 0 && mentions > 0 ? ' • ' : ''}
            {mentions > 0 ? `${mentions} mentions` : ''}
          </div>
        </div>
      ) : (
        <div
          className={cn(
            'absolute left-full ml-4 top-1/2 -translate-y-1/2 z-50',
            'px-3 py-2 bg-bg-primary border border-border-primary rounded-md shadow-lg',
            'text-sm text-text-primary whitespace-nowrap',
            'opacity-0 pointer-events-none group-hover:opacity-100',
            'transition-opacity duration-150'
          )}
        >
          {server.name}
        </div>
      )}
    </div>
  );
});

function ServerListComponent({
  servers,
  selectedServerId,
  onSelectServer,
  onServerCreated,
  onServerJoined,
  onUserSettingsClick,
}: ServerListProps) {
  const [isJoinCreateModalOpen, setIsJoinCreateModalOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col gap-2 p-2 bg-bg-tertiary h-full min-h-0">
        {servers.map((server) => (
          <ServerIcon
            key={server.id}
            server={server}
            isSelected={selectedServerId === server.id}
            onSelectServer={onSelectServer}
          />
        ))}

        <div className="mx-2 h-0.5 bg-border-primary rounded-full" />

        <div className="relative group mb-auto">
          <button
            onClick={() => setIsJoinCreateModalOpen(true)}
            className={cn(
              'w-12 h-12 rounded-full flex items-center justify-center ml-1',
              'bg-bg-quaternary text-green-primary',
              'transition-all duration-200 ease-in-out',
              'hover:bg-green-primary hover:text-bg-primary',
              'hover:rounded-2xl',
              'hover:shadow-[0_0_12px_rgba(118,185,0,0.3)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-primary'
            )}
            title="Add a Server"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <div
            className={cn(
              'absolute left-full ml-4 top-1/2 -translate-y-1/2 z-50',
              'px-3 py-2 bg-bg-primary border border-border-primary rounded-md shadow-lg',
              'text-sm text-text-primary whitespace-nowrap',
              'opacity-0 pointer-events-none group-hover:opacity-100',
              'transition-opacity duration-150'
            )}
          >
            Add a Server
          </div>
        </div>

        <div className="relative group mt-auto">
          <button
            onClick={() => onUserSettingsClick?.()}
            className={cn(
              'w-12 h-12 rounded-full flex items-center justify-center ml-1',
              'bg-bg-quaternary text-text-secondary',
              'transition-all duration-200 ease-in-out',
              'hover:bg-green-primary hover:text-bg-primary',
              'hover:rounded-2xl',
              'hover:shadow-[0_0_12px_rgba(118,185,0,0.3)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-primary'
            )}
            title="User Settings"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </button>
          <div
            className={cn(
              'absolute left-full ml-4 top-1/2 -translate-y-1/2 z-50',
              'px-3 py-2 bg-bg-primary border border-border-primary rounded-md shadow-lg',
              'text-sm text-text-primary whitespace-nowrap',
              'opacity-0 pointer-events-none group-hover:opacity-100',
              'transition-opacity duration-150'
            )}
          >
            User Settings
          </div>
        </div>
      </div>

      <JoinCreateServerModal
        isOpen={isJoinCreateModalOpen}
        onClose={() => setIsJoinCreateModalOpen(false)}
        onServerCreated={(server) => {
          setIsJoinCreateModalOpen(false);
          onServerCreated?.(server);
        }}
        onServerJoined={(server) => {
          setIsJoinCreateModalOpen(false);
          onServerJoined?.(server);
          onSelectServer(server.id);
        }}
      />
    </>
  );
}

export const ServerList = memo(ServerListComponent);
