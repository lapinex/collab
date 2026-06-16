'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { Modal, ModalHeader, ModalBody } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQueryClient } from '@tanstack/react-query';
import { apiPatch } from '@/lib/api-client';
import { useServerMembers } from '@/hooks/serverView';
import { useServerPermissions } from '@/hooks/useServerPermissions';
import { invalidateServerViewSlices } from '@/lib/query-keys/serverViewKeys';
import { scheduleRefetchServerViewSlices } from '@/hooks/useServerViewQuery';
import { SERVER_LIMITS } from '@/lib/constants';
import type { Server, Role, Channel } from '@/types/server';

interface ServerSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after exit animation finishes (for delayed unmount). */
  onClosed?: () => void;
  server: Server | null;
  currentUserId: string;
  onServerUpdated?: () => void;
}

export function ServerSettingsModal({
  isOpen,
  onClose,
  onClosed,
  server,
  currentUserId,
  onServerUpdated,
}: ServerSettingsModalProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('general');
  const [serverName, setServerName] = useState(server?.name || '');
  const { permissions: serverPerms } = useServerPermissions(server?.id ?? null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwner = server?.ownerId === currentUserId;

  const handleSaveGeneral = async () => {
    if (!server) return;
    setIsSaving(true);
    setError(null);

    try {
      await apiPatch(`/api/servers/${server.id}`, {
        name: serverName,
      });
      setTimeout(() => {
        invalidateServerViewSlices(queryClient, server.id);
        scheduleRefetchServerViewSlices(queryClient, server.id);
        queryClient.invalidateQueries({ queryKey: ['servers'] });
      }, 0);
      onServerUpdated?.();
      onClose();
    } catch (err) {
      console.error('Failed to update server:', err);
      setError('Failed to update server settings');
    } finally {
      setIsSaving(false);
    }
  };

  if (!server) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} onClosed={onClosed} className="max-w-2xl max-h-[80vh]">
      <ModalHeader onClose={onClose}>Server Settings</ModalHeader>
      <ModalBody>
        {error && (
          <div className="bg-danger/20 text-danger p-3 rounded-md mb-4 text-sm">
            {error}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="channels">Channels</TabsTrigger>
            <TabsTrigger value="roles">Roles</TabsTrigger>
            <TabsTrigger value="invitations">Invites</TabsTrigger>
            <TabsTrigger value="audit">Audit Log</TabsTrigger>
            <TabsTrigger value="moderation">Moderation</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-4">
            <div className="space-y-4">
              <div>
                <Label htmlFor="server-name">Server Name</Label>
                <Input
                  id="server-name"
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  disabled={!isOwner}
                  maxLength={SERVER_LIMITS.MAX_SERVER_NAME_LENGTH}
                />
              </div>
              {isOwner && (
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveGeneral} disabled={isSaving}>
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="members" className="mt-4">
            <MembersTab serverId={server.id} isOwner={isOwner} />
          </TabsContent>

          <TabsContent value="channels" className="mt-4">
            <ChannelsTab serverId={server.id} isOwner={isOwner} canManageChannels={serverPerms.canManageChannels} />
          </TabsContent>

          <TabsContent value="roles" className="mt-4">
            <RolesTab serverId={server.id} isOwner={isOwner} />
          </TabsContent>

          <TabsContent value="invitations" className="mt-4">
            <InvitationsTab queryClient={queryClient} serverId={server.id} isOwner={isOwner} canCreateInvites={serverPerms.canCreateInvites} canManageInvites={serverPerms.canManageInvites} />
          </TabsContent>

          <TabsContent value="audit" className="mt-4">
            <AuditLogTab serverId={server.id} canViewAuditLog={serverPerms.canViewAuditLog} />
          </TabsContent>

          <TabsContent value="moderation" className="mt-4">
            <ModerationTab serverId={server.id} isOwner={isOwner} />
          </TabsContent>
        </Tabs>
      </ModalBody>
    </Modal>
  );
}

// Members Tab Component
function MembersTab({ serverId, isOwner }: { serverId: string; isOwner: boolean }) {
  const { data: membersData, isLoading } = useServerMembers(serverId);
  const members = membersData ?? [];

  if (isLoading) {
    return <div className="text-text-muted">Loading members...</div>;
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">
        Members — {members.length}
      </div>
      {members.length === 0 ? (
        <div className="text-text-muted text-sm">No members found</div>
      ) : (
        members.map((member) => (
          <div
            key={member.id}
            className="flex items-center justify-between p-2 rounded-md hover:bg-bg-hover"
          >
            <div className="flex items-center gap-2">
              {member.avatarUrl ? (
                <Image
                  src={member.avatarUrl}
                  alt={member.name}
                  width={32}
                  height={32}
                  sizes="32px"
                  className="w-8 h-8 rounded-full object-cover"
                  unoptimized={member.avatarUrl.startsWith('data:') || member.avatarUrl.startsWith('/media/')}
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-bg-quaternary flex items-center justify-center text-xs">
                  {member.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex flex-col">
                <span className="text-sm font-medium">{member.name}</span>
                {member.roles.length > 0 && (
                  <span className="text-xs text-text-muted">
                    {member.roles.map((r) => r.name).join(', ')}
                  </span>
                )}
              </div>
            </div>
            {isOwner && (
              <Button variant="ghost" size="sm">
                Manage
              </Button>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// Channels Tab Component
function ChannelsTab({
  serverId,
  isOwner,
  canManageChannels,
}: {
  serverId: string;
  isOwner: boolean;
  canManageChannels: boolean;
}) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const loadChannels = async () => {
      try {
        const response = await fetch(`/api/servers/${serverId}/channels`, { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to fetch channels');
        const data = await response.json();
        setChannels(data.channels ?? []);
        setIsLoading(false);
      } catch (error) {
        console.error('Failed to load channels:', error);
        setChannels([]);
        setIsLoading(false);
      }
    };
    void loadChannels();
  }, [serverId]);

  const canManage = isOwner || canManageChannels;

  const handleDeleteChannel = async (channelId: string, channelName: string) => {
    if (!canManage) return;
    if (!confirm(`Delete channel #${channelName}?`)) return;
    setIsDeletingId(channelId);
    try {
      const response = await fetch(`/api/channels/${channelId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to delete channel');
      setChannels((prev) => prev.filter((c) => c.id !== channelId));
    } catch (error) {
      console.error('Failed to delete channel:', error);
      alert('Failed to delete channel');
    } finally {
      setIsDeletingId(null);
    }
  };

  if (isLoading) {
    return <div className="text-text-muted">Loading channels...</div>;
  }

  return (
    <div className="space-y-2">
      {canManage && (
        <Button variant="outline" size="sm" className="w-full">
          Create Channel
        </Button>
      )}
      {channels.length === 0 ? (
        <div className="text-text-muted text-sm">No channels found</div>
      ) : (
        channels.map((channel) => (
          <div
            key={channel.id}
            className="flex items-center justify-between p-2 rounded-md hover:bg-bg-hover"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm">{channel.type === 'text' ? '#' : '🔊'}</span>
              <span className="text-sm font-medium">{channel.name}</span>
            </div>
            {canManage && (
              <Button
                variant="ghost"
                size="sm"
                className="text-danger hover:text-danger"
                disabled={isDeletingId === channel.id}
                onClick={() => handleDeleteChannel(channel.id, channel.name)}
              >
                {isDeletingId === channel.id ? 'Deleting...' : 'Delete'}
              </Button>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// Roles Tab Component
function RolesTab({ serverId, isOwner }: { serverId: string; isOwner: boolean }) {
  const [roles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadRoles = async () => {
      try {
        // TODO: Implement API call to fetch roles
        setIsLoading(false);
      } catch (error) {
        console.error('Failed to load roles:', error);
        setIsLoading(false);
      }
    };
    void loadRoles();
  }, [serverId]);

  if (isLoading) {
    return <div className="text-text-muted">Loading roles...</div>;
  }

  return (
    <div className="space-y-2">
      {isOwner && (
        <Button variant="outline" size="sm" className="w-full">
          Create Role
        </Button>
      )}
      {roles.length === 0 ? (
        <div className="text-text-muted text-sm">No roles found</div>
      ) : (
        roles.map((role) => (
          <div
            key={role.id}
            className="flex items-center justify-between p-2 rounded-md hover:bg-bg-hover"
          >
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: role.color }}
              />
              <span className="text-sm font-medium">{role.name}</span>
            </div>
            {isOwner && (
              <Button variant="ghost" size="sm">
                Edit
              </Button>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// Invitations Tab Component
interface Invitation {
  id: string;
  code: string;
  serverId: string;
  createdBy?: string;
  creatorName?: string | null;
  expiresAt: string | null;
  maxUses: number | null;
  uses: number;
  createdAt: string;
}

function InvitationsTab({
  queryClient,
  serverId,
  isOwner,
  canCreateInvites,
  canManageInvites,
}: {
  queryClient: ReturnType<typeof useQueryClient>;
  serverId: string;
  isOwner: boolean;
  canCreateInvites: boolean;
  canManageInvites: boolean;
}) {
  const canView = isOwner || canManageInvites || canCreateInvites;
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newInvitation, setNewInvitation] = useState<Invitation | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const loadInvitations = useCallback(async () => {
    if (!canView) return;
    try {
      setIsLoading(true);
      const response = await fetch(`/api/invites?serverId=${serverId}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch invitations');
      const data = await response.json();
      setInvitations(data.invitations || []);
    } catch (error) {
      console.error('Failed to load invitations:', error);
      setInvitations([]);
    } finally {
      setIsLoading(false);
    }
  }, [serverId, canView]);

  useEffect(() => {
    if (canView) void loadInvitations();
  }, [canView, loadInvitations]);

  const handleCreateInvitation = async () => {
    if (!canCreateInvites || !serverId) return;
    setIsCreating(true);
    try {
      const response = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ serverId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const msg = (data as { error?: string }).error || response.statusText || `HTTP ${response.status}`;
        throw new Error(msg);
      }
      const invitation = (data as { invitation?: { code: string }; code?: string }).invitation ?? data;
      setNewInvitation(invitation);
      await loadInvitations();
      setTimeout(() => {
        invalidateServerViewSlices(queryClient, serverId);
        scheduleRefetchServerViewSlices(queryClient, serverId);
      }, 0);
    } catch (error) {
      console.error('Failed to create invitation:', error);
      alert(error instanceof Error ? error.message : 'Не удалось создать приглашение');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteInvitation = async (invId: string) => {
    if (!canManageInvites) return;
    if (!confirm('Delete this invite? It will stop working immediately.')) return;
    try {
      const res = await fetch(`/api/invites/${invId}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) await loadInvitations();
      else alert('Failed to delete invite');
    } catch (e) {
      console.error(e);
      alert('Failed to delete invite');
    }
  };

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (error) {
      console.error('Failed to copy code:', error);
    }
  };

  const getInvitationUrl = (code: string) => {
    return `${window.location.origin}/join?code=${code}`;
  };

  if (!canView) {
    return <div className="text-text-muted text-sm">You don&apos;t have permission to view invitations</div>;
  }

  if (isLoading) {
    return <div className="text-text-muted">Loading invitations...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Invites</h3>
        {canCreateInvites && (
          <Button onClick={handleCreateInvitation} disabled={isCreating} size="sm">
            {isCreating ? 'Creating...' : 'Create Invite'}
          </Button>
        )}
      </div>

      {newInvitation && (
        <div className="bg-success/20 border border-success/30 rounded-md p-4 space-y-2">
          <div className="text-sm font-semibold text-success">Invitation Created!</div>
          <div className="text-xs text-text-muted">Share this link to invite people to your server:</div>
          <div className="flex items-center gap-2">
            <Input
              value={getInvitationUrl(newInvitation.code)}
              readOnly
              className="flex-1 text-xs font-mono"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopyCode(getInvitationUrl(newInvitation.code))}
            >
              {copiedCode === getInvitationUrl(newInvitation.code) ? 'Copied!' : 'Copy Link'}
            </Button>
          </div>
          <div className="text-xs text-text-muted">Or share the code: <code className="font-mono bg-bg-secondary px-1 py-0.5 rounded">{newInvitation.code}</code></div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setNewInvitation(null)}
            className="mt-2"
          >
            Close
          </Button>
        </div>
      )}

      <div className="space-y-2">
        {invitations.length === 0 ? (
          <div className="text-text-muted text-sm">No invitations created yet</div>
        ) : (
          invitations.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center justify-between p-3 rounded-md border border-bg-tertiary"
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono bg-bg-secondary px-2 py-1 rounded">
                    {inv.code}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopyCode(getInvitationUrl(inv.code))}
                    className="h-6 text-xs"
                  >
                    {copiedCode === getInvitationUrl(inv.code) ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
                {inv.creatorName && (
                  <div className="text-xs text-text-muted">Created by: {inv.creatorName}</div>
                )}
                <div className="text-xs text-text-muted">
                  Uses: {inv.uses}
                  {inv.maxUses != null ? ` / ${inv.maxUses}` : ' / ∞'}
                  {inv.expiresAt && (
                    <> • Expires: {new Date(inv.expiresAt).toLocaleDateString()}</>
                  )}
                </div>
                <div className="text-xs text-text-muted">
                  Created: {new Date(inv.createdAt).toLocaleDateString()}
                </div>
              </div>
              {canManageInvites && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger hover:text-danger hover:bg-danger/10"
                  onClick={() => handleDeleteInvitation(inv.id)}
                >
                  Delete
                </Button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Audit Log Tab Component
const ACTION_LABELS: Record<string, string> = {
  CHANNEL_CREATED: 'created channel',
  CHANNEL_UPDATED: 'updated channel',
  CHANNEL_DELETED: 'deleted channel',
  ROLE_ASSIGNED: 'assigned role',
  ROLE_REMOVED: 'removed role',
  MEMBER_KICKED: 'kicked member',
  MEMBER_BANNED: 'banned member',
  MESSAGE_DELETED: 'deleted message',
  INVITE_CREATED: 'created invite',
  INVITE_DELETED: 'deleted invite',
  INVITE_USED: 'used invite',
};

function AuditLogTab({ serverId, canViewAuditLog }: { serverId: string; canViewAuditLog: boolean }) {
  const [entries, setEntries] = useState<Array<{
    id: string;
    actorName: string | null;
    action: string;
    targetType: string | null;
    targetId: string | null;
    meta: Record<string, unknown> | null;
    createdAt: string;
  }>>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadAudit = useCallback(async (cursor?: string) => {
    if (!canViewAuditLog) return;
    const url = cursor
      ? `/api/audit?serverId=${serverId}&cursor=${encodeURIComponent(cursor)}`
      : `/api/audit?serverId=${serverId}`;
    try {
      if (!cursor) setLoading(true);
      else setLoadingMore(true);
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load audit log');
      const data = await res.json();
      const list = (data.entries || []).map((e: { id: string; actorName: string | null; action: string; targetType: string | null; targetId: string | null; meta: Record<string, unknown> | null; createdAt: string }) => ({
        id: e.id,
        actorName: e.actorName,
        action: e.action,
        targetType: e.targetType,
        targetId: e.targetId,
        meta: e.meta,
        createdAt: e.createdAt,
      }));
      if (!cursor) setEntries(list);
      else setEntries((prev) => [...prev, ...list]);
      setNextCursor(data.nextCursor ?? null);
    } catch (e) {
      console.error(e);
      if (!cursor) setEntries([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [serverId, canViewAuditLog]);

  useEffect(() => {
    if (canViewAuditLog && serverId) void loadAudit();
  }, [canViewAuditLog, serverId, loadAudit]);

  if (!canViewAuditLog) {
    return <div className="text-text-muted text-sm">You don&apos;t have permission to view the audit log</div>;
  }

  if (loading) {
    return <div className="text-text-muted">Loading audit log...</div>;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Audit Log</h3>
      <p className="text-xs text-text-muted">Server actions by moderators and admins</p>
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {entries.length === 0 ? (
          <div className="text-text-muted text-sm">No audit entries yet</div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="p-3 rounded-md border border-border-primary bg-bg-tertiary text-sm"
            >
              <div className="flex flex-wrap items-baseline gap-1">
                <span className="font-medium text-text-primary">
                  {entry.actorName ?? 'Unknown'}
                </span>
                <span className="text-text-muted">
                  {ACTION_LABELS[entry.action] ?? entry.action}
                </span>
                {entry.meta && typeof entry.meta === 'object' && Object.keys(entry.meta).length > 0 && (() => {
                  const m = entry.meta as Record<string, unknown>;
                  const parts: string[] = [];
                  if (m.channelName != null) parts.push(`#${String(m.channelName)}`);
                  if (m.roleName != null) parts.push(`role "${String(m.roleName)}"`);
                  if (m.code != null) parts.push(`code ${String(m.code)}`);
                  return parts.length ? <span className="text-text-muted text-xs"> {parts.join(' ')}</span> : null;
                })()}
              </div>
              <div className="text-xs text-text-muted mt-1">
                {new Date(entry.createdAt).toLocaleString()}
              </div>
            </div>
          ))
        )}
      </div>
      {nextCursor && (
        <Button
          variant="outline"
          size="sm"
          disabled={loadingMore}
          onClick={() => loadAudit(nextCursor)}
        >
          {loadingMore ? 'Loading...' : 'Load more'}
        </Button>
      )}
    </div>
  );
}

// Moderation Tab Component
function ModerationTab({ isOwner }: { serverId: string; isOwner: boolean }) {
  if (!isOwner) {
    return <div className="text-text-muted text-sm">Only server owners can access moderation settings</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-2">Banned Users</h3>
        <div className="text-text-muted text-sm">Manage banned users</div>
      </div>
    </div>
  );
}

