'use client';

import { useState, useEffect, useCallback } from 'react';
import { Copy, Trash2, Shield, Code, Mail, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useWhitelist, useDeveloperCodes, useAdminStats, useAdminDbTool, type AdminDbTable } from '@/hooks/useAdminPanel';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <button
        type="button"
        onClick={copy}
        className="p-1.5 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors"
        title={copied ? 'Copied!' : 'Copy'}
      >
        <Copy className="w-4 h-4" />
      </button>
      {copied && <span className="text-xs text-green-primary">Copied!</span>}
    </span>
  );
}

export function AdminPanel() {
  const [activeTab, setActiveTab] = useState<'whitelist' | 'codes' | 'db'>('whitelist');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'email' | 'code'; id: string; email?: string } | null>(
    null
  );

  const whitelist = useWhitelist();
  const codes = useDeveloperCodes();
  const stats = useAdminStats();
  const dbTool = useAdminDbTool();

  const [emailInput, setEmailInput] = useState('');
  const [codeCount, setCodeCount] = useState(1);
  const [codesPage, setCodesPage] = useState(0);
  const [codesFilter, setCodesFilter] = useState<'all' | 'used' | 'unused'>('all');
  const [codesSort, setCodesSort] = useState<'created_at' | 'code' | 'used_at'>('created_at');
  const [whitelistSearch, setWhitelistSearch] = useState('');
  const [dbTable, setDbTable] = useState<AdminDbTable>('users');
  const [dbSearch, setDbSearch] = useState('');
  const [dbDevCode, setDbDevCode] = useState('');

  const showMessage = useCallback((type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  }, []);

  useEffect(() => {
    if (activeTab === 'whitelist') whitelist.fetchList(200, 0);
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab === 'codes') {
      codes.fetchList({
        limit: PAGE_SIZE,
        offset: codesPage * PAGE_SIZE,
        used: codesFilter === 'all' ? undefined : codesFilter === 'used',
        sortBy: codesSort,
        order: 'desc',
      });
    }
  }, [activeTab, codesPage, codesFilter, codesSort]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab === 'codes') stats.fetchStats();
  }, [activeTab, codes.codes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddEmail = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const email = emailInput.trim().toLowerCase();
      if (!email) return;
      const result = await whitelist.addEmail(email);
      if (result.success) {
        setEmailInput('');
        showMessage('success', `Added ${email}`);
      } else {
        showMessage('error', result.error ?? 'Failed to add');
      }
    },
    [emailInput, whitelist, showMessage]
  );

  const handleRemoveEmail = useCallback(
    async (email: string) => {
      setConfirmDelete(null);
      const result = await whitelist.removeEmail(email);
      if (result.success) showMessage('success', 'Email removed');
      else showMessage('error', result.error ?? 'Failed to remove');
    },
    [whitelist, showMessage]
  );

  const handleCreateCodes = useCallback(async () => {
    const count = Math.min(100, Math.max(1, codeCount));
    const result = await codes.createCodes(count);
    if (result.success) {
      showMessage('success', `Generated ${result.codes?.length ?? count} code(s)`);
      void stats.fetchStats();
    } else {
      showMessage('error', result.error ?? 'Failed to generate');
    }
  }, [codeCount, codes, stats, showMessage]);

  const handleDeleteCode = useCallback(
    async (codeId: string) => {
      setConfirmDelete(null);
      const result = await codes.deleteCode(codeId);
      if (result.success) {
        showMessage('success', 'Code deleted');
        void stats.fetchStats();
      } else {
        showMessage('error', result.error ?? 'Failed to delete');
      }
    },
    [codes, stats, showMessage]
  );

  const filteredWhitelist = whitelistSearch.trim()
    ? whitelist.list.filter((e) => e.email.toLowerCase().includes(whitelistSearch.trim().toLowerCase()))
    : whitelist.list;

  const totalPages = Math.max(1, Math.ceil(codes.total / PAGE_SIZE));

  return (
    <div className="border-t border-border-primary pt-6 mt-6">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-5 h-5 text-green-primary" />
        <h3 className="text-lg font-semibold text-text-primary">Admin Panel</h3>
      </div>

      {message && (
        <div
          className={cn(
            'mb-4 p-3 rounded-md text-sm',
            message.type === 'success' ? 'bg-green-primary/10 text-green-primary' : 'bg-danger/10 text-danger'
          )}
        >
          {message.text}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'whitelist' | 'codes')}>
        <TabsList className="mb-4">
          <TabsTrigger value="whitelist" className="gap-1.5">
            <Mail className="w-4 h-4" />
            Whitelist
          </TabsTrigger>
          <TabsTrigger value="codes" className="gap-1.5">
            <Code className="w-4 h-4" />
            Developer Codes
          </TabsTrigger>
          <TabsTrigger value="db" className="gap-1.5">
            DB Tools
          </TabsTrigger>
        </TabsList>

        <TabsContent value="whitelist" className="space-y-4">
          <form onSubmit={handleAddEmail} className="flex gap-2 flex-wrap items-end">
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="admin-whitelist-email">Email</Label>
              <Input
                id="admin-whitelist-email"
                type="email"
                placeholder="user@example.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddEmail()}
                disabled={whitelist.loading}
              />
            </div>
            <Button type="submit" disabled={whitelist.loading || !emailInput.trim()}>
              {whitelist.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
            </Button>
          </form>

          <div>
            <Label className="text-text-muted text-sm">Search</Label>
            <Input
              type="text"
              placeholder="Filter by email..."
              value={whitelistSearch}
              onChange={(e) => setWhitelistSearch(e.target.value)}
              className="mt-1 max-w-xs"
            />
          </div>

          {whitelist.error && (
            <div className="p-3 rounded bg-danger/10 text-danger text-sm">{whitelist.error}</div>
          )}

          {whitelist.loading && !whitelist.list.length ? (
            <div className="flex items-center gap-2 text-text-muted py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading whitelist...
            </div>
          ) : !whitelist.error && filteredWhitelist.length === 0 ? (
            <div className="py-8 text-center text-text-muted text-sm">No emails in whitelist</div>
          ) : (
            <ul className="space-y-1 max-h-[280px] overflow-y-auto rounded border border-border-primary divide-y divide-border-primary">
              {filteredWhitelist.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-bg-hover group"
                >
                  <span className="text-sm text-text-primary truncate">{item.email}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {confirmDelete?.type === 'email' && confirmDelete.email === item.email ? (
                      <>
                        <Button size="sm" variant="destructive" onClick={() => handleRemoveEmail(item.email)}>
                          Yes
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="opacity-70 hover:opacity-100 text-danger hover:text-danger"
                        onClick={() => setConfirmDelete({ type: 'email', id: item.id, email: item.email })}
                        title="Remove from whitelist"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="codes" className="space-y-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <Label htmlFor="admin-code-count">Number of codes</Label>
              <Input
                id="admin-code-count"
                type="number"
                min={1}
                max={100}
                value={codeCount}
                onChange={(e) => setCodeCount(Math.min(100, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                className="w-20 mt-1"
              />
            </div>
            <Button onClick={handleCreateCodes} disabled={codes.loading}>
              {codes.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Generate Code(s)'}
            </Button>
          </div>

          {stats.stats && (
            <div className="flex gap-4 flex-wrap text-sm">
              <span className="text-text-muted">Total: <strong className="text-text-primary">{stats.stats.total}</strong></span>
              <span className="text-text-muted">Used: <strong className="text-text-primary">{stats.stats.used}</strong></span>
              <span className="text-text-muted">Unused: <strong className="text-text-primary">{stats.stats.unused}</strong></span>
              <span className="text-text-muted">Registrations: <strong className="text-text-primary">{stats.stats.totalRegistrations}</strong></span>
            </div>
          )}

          <div className="flex flex-wrap gap-2 items-center">
            <Label className="text-text-muted text-sm">Filter:</Label>
            {(['all', 'unused', 'used'] as const).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={codesFilter === f ? 'default' : 'ghost'}
                onClick={() => setCodesFilter(f)}
              >
                {f === 'all' ? 'All' : f === 'used' ? 'Used' : 'Unused'}
              </Button>
            ))}
            <Label className="text-text-muted text-sm ml-2">Sort:</Label>
            <select
              value={codesSort}
              onChange={(e) => setCodesSort(e.target.value as 'created_at' | 'code' | 'used_at')}
              className="rounded border border-border-primary bg-bg-secondary text-text-primary px-2 py-1 text-sm"
            >
              <option value="created_at">Created</option>
              <option value="code">Code</option>
              <option value="used_at">Used at</option>
            </select>
          </div>

          {codes.error && (
            <div className="p-3 rounded bg-danger/10 text-danger text-sm">{codes.error}</div>
          )}

          {codes.loading && !codes.codes.length ? (
            <div className="flex items-center gap-2 text-text-muted py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading codes...
            </div>
          ) : !codes.error && codes.codes.length === 0 ? (
            <div className="py-8 text-center text-text-muted text-sm">No developer codes</div>
          ) : (
            <>
              <div className="rounded border border-border-primary overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-bg-tertiary border-b border-border-primary">
                      <th className="text-left px-3 py-2 font-medium text-text-primary">Code</th>
                      <th className="text-left px-3 py-2 font-medium text-text-primary">Status</th>
                      <th className="text-left px-3 py-2 font-medium text-text-primary">Used by</th>
                      <th className="text-left px-3 py-2 font-medium text-text-primary">Created</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {codes.codes.map((c) => (
                      <tr key={c.id} className="border-b border-border-primary last:border-0 hover:bg-bg-hover">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <code className="text-text-primary font-mono text-xs">{c.code}</code>
                            <CopyButton text={c.code} />
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          {c.used ? (
                            <span className="text-amber-600 dark:text-amber-400">Used</span>
                          ) : (
                            <span className="text-green-600 dark:text-green-400">Unused</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-text-muted">
                          {c.usedBy ? `${c.usedBy.name ?? c.usedBy.email}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-text-muted">
                          {new Date(c.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-2">
                          {confirmDelete?.type === 'code' && confirmDelete.id === c.id ? (
                            <div className="flex gap-1">
                              <Button size="sm" variant="destructive" onClick={() => handleDeleteCode(c.id)}>
                                Yes
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-danger hover:text-danger"
                              disabled={c.used}
                              onClick={() => setConfirmDelete({ type: 'code', id: c.id })}
                              title={c.used ? 'Cannot delete used code' : 'Delete code'}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <span className="text-sm text-text-muted">
                    Page {codesPage + 1} of {totalPages} ({codes.total} total)
                  </span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={codesPage === 0}
                      onClick={() => setCodesPage((p) => Math.max(0, p - 1))}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={codesPage >= totalPages - 1}
                      onClick={() => setCodesPage((p) => p + 1)}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="db" className="space-y-4">
          <div className="rounded border border-border-primary p-3 space-y-3">
            <div className="text-sm text-text-muted">
              Safe CRUD whitelist: <code>users</code>, <code>roles</code>, <code>channels</code>, <code>messages</code>.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <select
                value={dbTable}
                onChange={(e) => setDbTable(e.target.value as AdminDbTable)}
                className="rounded border border-border-primary bg-bg-secondary text-text-primary px-2 py-2 text-sm"
              >
                <option value="users">users</option>
                <option value="roles">roles</option>
                <option value="channels">channels</option>
                <option value="messages">messages</option>
              </select>
              <Input
                value={dbSearch}
                onChange={(e) => setDbSearch(e.target.value)}
                placeholder="Search"
              />
              <Input
                value={dbDevCode}
                onChange={(e) => setDbDevCode(e.target.value)}
                placeholder="Developer code gate"
              />
              <Button
                onClick={() => dbTool.fetchRows(dbTable, dbDevCode, dbSearch, 50, 0)}
                disabled={dbTool.loading || !dbDevCode.trim()}
              >
                {dbTool.loading ? 'Loading...' : 'Load'}
              </Button>
            </div>
            {dbTool.error && (
              <div className="p-3 rounded bg-danger/10 text-danger text-sm">{dbTool.error}</div>
            )}
          </div>

          <div className="space-y-2 max-h-[360px] overflow-auto">
            {dbTool.rows.map((row) => {
              const id = String((row.id as string | undefined) ?? '');
              const text = JSON.stringify(row, null, 2);
              return (
                <div key={id || text} className="rounded border border-border-primary p-3 space-y-2">
                  <pre className="text-xs whitespace-pre-wrap break-all text-text-secondary">{text}</pre>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const raw = prompt('Edit row JSON patch', '{}');
                        if (!raw) return;
                        try {
                          const patch = JSON.parse(raw) as Record<string, unknown>;
                          const result = await dbTool.updateRow(dbTable, id, patch, dbDevCode);
                          if (!result.success) {
                            showMessage('error', result.error ?? 'Update failed');
                            return;
                          }
                          showMessage('success', 'Row updated');
                          await dbTool.fetchRows(dbTable, dbDevCode, dbSearch, 50, 0);
                        } catch {
                          showMessage('error', 'Invalid JSON');
                        }
                      }}
                      disabled={!id || !dbDevCode.trim()}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={async () => {
                        if (!confirm(`Delete row ${id}?`)) return;
                        const result = await dbTool.deleteRow(dbTable, id, dbDevCode);
                        if (!result.success) {
                          showMessage('error', result.error ?? 'Delete failed');
                          return;
                        }
                        showMessage('success', 'Row deleted');
                        await dbTool.fetchRows(dbTable, dbDevCode, dbSearch, 50, 0);
                      }}
                      disabled={!id || !dbDevCode.trim()}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
            {!dbTool.loading && dbTool.rows.length === 0 && (
              <div className="text-sm text-text-muted py-3">No rows loaded</div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
