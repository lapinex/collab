'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useServerPermissions } from '@/hooks/useServerPermissions';

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

interface AuditEntry {
  id: string;
  actorName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

interface AuditLogSettingsProps {
  serverId: string;
}

export function AuditLogSettings({ serverId }: AuditLogSettingsProps) {
  const { permissions } = useServerPermissions(serverId);
  const canViewAuditLog = permissions.canViewAuditLog;

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadAudit = useCallback(
    async (cursor?: string) => {
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
        const list = (data.entries || []) as AuditEntry[];
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
    },
    [serverId, canViewAuditLog]
  );

  useEffect(() => {
    if (canViewAuditLog && serverId) void loadAudit();
  }, [canViewAuditLog, serverId, loadAudit]);

  if (!canViewAuditLog) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-2">Audit Log</h2>
        <p className="text-text-muted text-sm">You don&apos;t have permission to view the audit log.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-2">Audit Log</h2>
        <p className="text-text-muted">Loading audit log...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Audit Log</h2>
      <p className="text-text-muted text-sm">Server actions by moderators and admins</p>
      <div className="space-y-2 max-h-[500px] overflow-y-auto">
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
