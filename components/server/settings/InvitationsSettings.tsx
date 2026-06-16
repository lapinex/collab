'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useServerPermissions } from '@/hooks/useServerPermissions';

interface Invitation {
  id: string;
  code: string;
  serverId: string;
  expiresAt: string | null;
  maxUses: number | null;
  uses: number;
  createdAt: string;
}

interface InviteAuditEntry {
  id: string;
  serverId: string;
  inviteId: string | null;
  action: string;
  userId: string;
  createdAt: string;
}

interface InvitationsSettingsProps {
  serverId: string;
  isOwner: boolean;
}

export function InvitationsSettings({ serverId, isOwner }: InvitationsSettingsProps) {
  const { permissions: serverPerms } = useServerPermissions(serverId ?? null);
  const canCreateInvites = isOwner || serverPerms.canCreateInvites;
  const canManageInvites = isOwner || serverPerms.canManageInvites;
  const canViewAuditLog = isOwner || serverPerms.canViewAuditLog;
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newInvitation, setNewInvitation] = useState<Invitation | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [auditEntries, setAuditEntries] = useState<InviteAuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadInvitations = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/invites?serverId=${encodeURIComponent(serverId)}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch invitations');
      }
      const data = await response.json();
      setInvitations(data.invitations || []);
    } catch (error) {
      console.error('Failed to load invitations:', error);
      setInvitations([]);
    } finally {
      setIsLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    if (canManageInvites || canCreateInvites) {
      void loadInvitations();
    }
  }, [serverId, canManageInvites, canCreateInvites, loadInvitations]);

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
        const msg = (data as { error?: string }).error || response.statusText || 'Failed to create invitation';
        throw new Error(msg);
      }
      setNewInvitation((data as { invitation?: Invitation }).invitation ?? (data as Invitation));
      await loadInvitations();
    } catch (error) {
      console.error('Failed to create invitation:', error);
      alert(error instanceof Error ? error.message : 'Не удалось создать приглашение');
    } finally {
      setIsCreating(false);
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

  const loadAuditLog = useCallback(async () => {
    if (!serverId || !canViewAuditLog) return;
    setAuditLoading(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/audit-log/invites`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setAuditEntries(data.entries || []);
      }
    } catch {
      setAuditEntries([]);
    } finally {
      setAuditLoading(false);
    }
  }, [serverId, canViewAuditLog]);

  useEffect(() => {
    if (canViewAuditLog && serverId) void loadAuditLog();
  }, [canViewAuditLog, serverId, loadAuditLog]);

  const handleDeleteInvitation = async (invId: string) => {
    if (!canManageInvites || !serverId) return;
    setDeletingId(invId);
    try {
      const res = await fetch(`/api/invites/${invId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        await loadInvitations();
        await loadAuditLog();
      } else {
        alert('Не удалось удалить приглашение');
      }
    } catch {
      alert('Не удалось удалить приглашение');
    } finally {
      setDeletingId(null);
    }
  };

  if (!canCreateInvites && !canManageInvites) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-2">Invitations</h2>
        <p className="text-text-muted text-sm mb-4">Управление приглашениями на сервер</p>
        <div className="text-text-muted text-sm">Нужно право CREATE_INVITES или MANAGE_INVITES</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-2">Invitations</h2>
        <p className="text-text-muted text-sm mb-4">Управление приглашениями на сервер</p>
        <div className="text-text-muted">Загрузка приглашений...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Invitations</h2>
        <p className="text-text-muted text-sm">Создавайте приглашения для приглашения людей на ваш сервер</p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Приглашения сервера</h3>
          {canCreateInvites && (
            <Button onClick={handleCreateInvitation} disabled={isCreating} size="sm">
              {isCreating ? 'Создание...' : 'Создать приглашение'}
            </Button>
          )}
        </div>

        {newInvitation && (
          <div className="bg-success/20 border border-success/30 rounded-md p-4 space-y-2">
            <div className="text-sm font-semibold text-success">Приглашение создано!</div>
            <div className="text-xs text-text-muted">Поделитесь этой ссылкой, чтобы пригласить людей на ваш сервер:</div>
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
                {copiedCode === getInvitationUrl(newInvitation.code) ? 'Скопировано!' : 'Копировать ссылку'}
              </Button>
            </div>
            <div className="text-xs text-text-muted">
              Или поделитесь кодом: <code className="font-mono bg-bg-secondary px-1 py-0.5 rounded">{newInvitation.code}</code>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setNewInvitation(null)}
              className="mt-2"
            >
              Закрыть
            </Button>
          </div>
        )}

        <div className="space-y-2">
          {!canManageInvites ? (
            <div className="text-text-muted text-sm">Нужно право MANAGE_INVITES для просмотра списка</div>
          ) : invitations.length === 0 ? (
            <div className="text-text-muted text-sm">Приглашения еще не созданы</div>
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
                      {copiedCode === getInvitationUrl(inv.code) ? 'Скопировано!' : 'Копировать'}
                    </Button>
                  </div>
                  <div className="text-xs text-text-muted">
                    Использований: {inv.uses}
                    {inv.maxUses ? ` / ${inv.maxUses}` : ' / ∞'}
                    {inv.expiresAt && (
                      <> • Истекает: {new Date(inv.expiresAt).toLocaleDateString('ru-RU')}</>
                    )}
                  </div>
                  <div className="text-xs text-text-muted">
                    Создано: {new Date(inv.createdAt).toLocaleDateString('ru-RU')}
                  </div>
                </div>
                {canManageInvites && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-500 border-red-500/50 hover:bg-red-500/10"
                    disabled={deletingId === inv.id}
                    onClick={() => handleDeleteInvitation(inv.id)}
                  >
                    {deletingId === inv.id ? '…' : 'Удалить'}
                  </Button>
                )}
              </div>
            ))
          )}
        </div>

        {canViewAuditLog && (
          <div className="space-y-2 mt-6">
            <h3 className="text-sm font-semibold">Лог приглашений (Audit Log)</h3>
            {auditLoading ? (
              <div className="text-text-muted text-sm">Загрузка...</div>
            ) : auditEntries.length === 0 ? (
              <div className="text-text-muted text-sm">Записей пока нет</div>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto rounded-md border border-bg-tertiary p-2">
                {auditEntries.map((e) => (
                  <div key={e.id} className="text-xs flex gap-2 text-text-secondary">
                    <span className="font-mono text-text-muted shrink-0">
                      {new Date(e.createdAt).toLocaleString('ru-RU')}
                    </span>
                    <span className={e.action === 'created' ? 'text-green-600' : e.action === 'deleted' ? 'text-red-600' : 'text-text-secondary'}>
                      {e.action}
                    </span>
                    <span>userId: {e.userId.slice(0, 8)}…</span>
                    {e.inviteId && <span>inviteId: {e.inviteId.slice(0, 8)}…</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
