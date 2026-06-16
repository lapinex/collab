'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useServerViewSlices } from '@/hooks/useServerViewSlices';
import { useServerMeta } from '@/hooks/serverView';
import { ServerSettingsLayout } from '@/components/server/settings/ServerSettingsLayout';
import { OverviewSettings } from '@/components/server/settings/OverviewSettings';
import { SecuritySettings } from '@/components/server/settings/SecuritySettings';
import { RolesSettings } from '@/components/server/settings/RolesSettings';
import { ChannelsSettings } from '@/components/server/settings/ChannelsSettings';
import { EmojiStickersSettings } from '@/components/server/settings/EmojiStickersSettings';
import { IntegrationsSettings } from '@/components/server/settings/IntegrationsSettings';
import { CommunitySettings } from '@/components/server/settings/CommunitySettings';
import { DangerZoneSettings } from '@/components/server/settings/DangerZoneSettings';
import { InvitationsSettings } from '@/components/server/settings/InvitationsSettings';
import { AuditLogSettings } from '@/components/server/settings/AuditLogSettings';

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

export default function ServerSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const serverId = (params?.serverId as string) || '';

  const { error: fetchError } = useServerViewSlices(serverId);
  const { data, isLoading } = useServerMeta(serverId);
  const server = data?.server ?? null;
  const error = fetchError instanceof Error ? fetchError.message : null;

  const [activeSection, setActiveSection] = useState<SettingsSection>('overview');

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-text-muted">Please log in to view server settings</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-text-muted">Loading server settings...</div>
      </div>
    );
  }

  if (error || !server) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-danger">{error || 'Server not found'}</div>
      </div>
    );
  }

  const isOwner = server.ownerId === user.id;

  return (
    <ServerSettingsLayout
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      onClose={() => router.push('/app')}
      server={{ name: server.name, iconUrl: server.iconUrl }}
    >
      {activeSection === 'overview' && (
        <OverviewSettings serverId={serverId} isOwner={isOwner} />
      )}
      {activeSection === 'security' && (
        <SecuritySettings serverId={serverId} isOwner={isOwner} />
      )}
      {activeSection === 'roles' && (
        <RolesSettings serverId={serverId} isOwner={isOwner} />
      )}
      {activeSection === 'channels' && (
        <ChannelsSettings serverId={serverId} isOwner={isOwner} />
      )}
      {activeSection === 'emoji' && (
        <EmojiStickersSettings serverId={serverId} isOwner={isOwner} />
      )}
      {activeSection === 'integrations' && (
        <IntegrationsSettings serverId={serverId} isOwner={isOwner} />
      )}
      {activeSection === 'community' && (
        <CommunitySettings serverId={serverId} isOwner={isOwner} />
      )}
      {activeSection === 'invitations' && (
        <InvitationsSettings serverId={serverId} isOwner={isOwner} />
      )}
      {activeSection === 'audit' && (
        <AuditLogSettings serverId={serverId} />
      )}
      {activeSection === 'danger' && (
        <DangerZoneSettings
          serverId={serverId}
          isOwner={isOwner}
          onDelete={() => router.push('/app')}
        />
      )}
    </ServerSettingsLayout>
  );
}
