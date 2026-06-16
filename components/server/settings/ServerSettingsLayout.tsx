'use client';

import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

type SettingsSection = 
  | 'overview' 
  | 'security' 
  | 'roles' 
  | 'channels' 
  | 'integrations' 
  | 'community' 
  | 'emoji' 
  | 'invitations'
  | 'audit'
  | 'danger';

interface ServerSettingsLayoutProps {
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  onClose: () => void;
  server: { name: string; iconUrl: string | null };
  children: React.ReactNode;
}

const sections: Array<{ id: SettingsSection; label: string; icon?: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'security', label: 'Security' },
  { id: 'roles', label: 'Roles' },
  { id: 'channels', label: 'Channels' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'community', label: 'Community' },
  { id: 'emoji', label: 'Emoji & Stickers' },
  { id: 'invitations', label: 'Invitations' },
  { id: 'audit', label: 'Audit Log' },
  { id: 'danger', label: 'Danger Zone' },
];

export function ServerSettingsLayout({
  activeSection,
  onSectionChange,
  onClose,
  server,
  children,
}: ServerSettingsLayoutProps) {

  return (
    <div className="fixed inset-0 z-50 bg-bg-primary flex">
      {/* Sidebar */}
      <div className="w-60 bg-bg-secondary border-r border-bg-tertiary flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-bg-tertiary">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Server Settings</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {server.iconUrl ? (
              <Image
                src={server.iconUrl}
                alt={server.name}
                width={32}
                height={32}
                className="w-8 h-8 rounded-full object-cover"
                unoptimized={server.iconUrl.startsWith('data:') || server.iconUrl.startsWith('/media/')}
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-bg-quaternary flex items-center justify-center text-xs font-semibold">
                {server.name.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-sm font-medium truncate">{server.name}</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-2">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => onSectionChange(section.id)}
              className={cn(
                'w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors mb-1',
                activeSection === section.id
                  ? 'bg-bg-hover text-text-primary'
                  : 'text-text-muted hover:bg-bg-hover hover:text-text-primary'
              )}
            >
              {section.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-bg-primary">
        <div className="max-w-4xl mx-auto p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
