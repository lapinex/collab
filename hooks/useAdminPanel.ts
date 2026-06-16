'use client';

import { useState, useCallback } from 'react';
import { apiGet, apiPost, apiDelete, apiPatch, ApiError } from '@/lib/api-client';

// --- Types ---

export interface WhitelistEmail {
  id: string;
  email: string;
  createdAt: string;
}

export interface DeveloperCode {
  id: string;
  code: string;
  used: boolean;
  usedBy: { id: string; email: string; name: string } | null;
  usedAt: string | null;
  createdAt: string;
}

export interface AdminStats {
  total: number;
  used: number;
  unused: number;
  totalRegistrations: number;
}

export type AdminDbTable = 'users' | 'roles' | 'channels' | 'messages';

// --- Whitelist ---

export function useWhitelist() {
  const [list, setList] = useState<WhitelistEmail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchList = useCallback(async (limit = 50, offset = 0) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ whitelistEmails: WhitelistEmail[] }>(
        `/api/admin/whitelist?limit=${limit}&offset=${offset}`
      );
      setList(data.whitelistEmails ?? []);
      return data.whitelistEmails;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to load whitelist';
      setError(msg);
      if (e instanceof ApiError && e.status === 403) throw e;
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const addEmail = useCallback(
    async (email: string) => {
      setError(null);
      try {
        const data = await apiPost<{ success: boolean; id: string; email: string; createdAt: string }>(
          '/api/admin/whitelist',
          { email: email.trim().toLowerCase() }
        );
        setList((prev) => [{ id: data.id, email: data.email, createdAt: data.createdAt }, ...prev]);
        return { success: true as const, data };
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : 'Failed to add email';
        setError(msg);
        return { success: false as const, error: msg };
      }
    },
    []
  );

  const removeEmail = useCallback(async (email: string) => {
    setError(null);
    try {
      await apiDelete(`/api/admin/whitelist/${encodeURIComponent(email)}`);
      setList((prev) => prev.filter((e) => e.email !== email));
      return { success: true as const };
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to remove email';
      setError(msg);
      return { success: false as const, error: msg };
    }
  }, []);

  const bulkAdd = useCallback(
    async (emails: string[]) => {
      setError(null);
      try {
        const data = await apiPost<{ added: WhitelistEmail[]; errors: { email: string; error: string }[] }>(
          '/api/admin/whitelist/bulk',
          { emails: emails.map((e) => e.trim().toLowerCase()).filter(Boolean) }
        );
        if ((data.added ?? []).length) {
          setList((prev) => [...(data.added ?? []), ...prev]);
        }
        return { success: true as const, added: data.added ?? [], errors: data.errors ?? [] };
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : 'Failed to add emails';
        setError(msg);
        return { success: false as const, error: msg, added: [], errors: [] };
      }
    },
    []
  );

  return { list, loading, error, fetchList, addEmail, removeEmail, bulkAdd, setError };
}

// --- Developer codes ---

export function useDeveloperCodes() {
  const [codes, setCodes] = useState<DeveloperCode[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchList = useCallback(
    async (params?: { limit?: number; offset?: number; used?: boolean; sortBy?: string; order?: string }) => {
      setLoading(true);
      setError(null);
      const limit = params?.limit ?? 20;
      const offset = params?.offset ?? 0;
      const q = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (params?.used === true) q.set('used', 'true');
      if (params?.used === false) q.set('used', 'false');
      if (params?.sortBy) q.set('sortBy', params.sortBy);
      if (params?.order) q.set('order', params.order);
      try {
        const data = await apiGet<{ codes: DeveloperCode[]; total: number }>(
          `/api/admin/developer-codes?${q.toString()}`
        );
        setCodes(data.codes ?? []);
        setTotal(data.total ?? 0);
        return data;
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : 'Failed to load codes';
        setError(msg);
        if (e instanceof ApiError && e.status === 403) throw e;
        return { codes: [], total: 0 };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const createCodes = useCallback(async (count = 1) => {
    setError(null);
    try {
      const data = await apiPost<{ success: boolean; codes: { id: string; code: string; createdAt: string }[] }>(
        '/api/admin/developer-codes',
        { count }
      );
      const newCodes: DeveloperCode[] = (data.codes ?? []).map((c) => ({
        id: c.id,
        code: c.code,
        used: false,
        usedBy: null,
        usedAt: null,
        createdAt: c.createdAt,
      }));
      setCodes((prev) => [...newCodes, ...prev]);
      setTotal((t) => t + newCodes.length);
      return { success: true as const, codes: newCodes };
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to create codes';
      setError(msg);
      return { success: false as const, error: msg };
    }
  }, []);

  const deleteCode = useCallback(async (codeId: string) => {
    setError(null);
    try {
      await apiDelete(`/api/admin/developer-codes/${codeId}`);
      setCodes((prev) => prev.filter((c) => c.id !== codeId));
      setTotal((t) => Math.max(0, t - 1));
      return { success: true as const };
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to delete code';
      setError(msg);
      return { success: false as const, error: msg };
    }
  }, []);

  return { codes, total, loading, error, fetchList, createCodes, deleteCode, setError };
}

// --- Stats ---

export function useAdminStats() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<AdminStats>('/api/admin/developer-codes/stats');
      setStats(data);
      return data;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to load stats';
      setError(msg);
      if (e instanceof ApiError && e.status === 403) throw e;
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { stats, loading, error, fetchStats };
}

export function useAdminDbTool() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRows = useCallback(async (table: AdminDbTable, devCode: string, q = '', limit = 50, offset = 0) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (q.trim()) params.set('q', q.trim());
      const data = await apiGet<{ rows: Record<string, unknown>[] }>(
        `/api/admin/db/${table}?${params.toString()}`,
        { headers: { 'x-developer-code': devCode } }
      );
      setRows(data.rows ?? []);
      return data.rows ?? [];
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to load table rows';
      setError(msg);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const updateRow = useCallback(async (table: AdminDbTable, id: string, patch: Record<string, unknown>, devCode: string) => {
    setError(null);
    try {
      await apiPatch(`/api/admin/db/${table}/${id}`, patch, {
        headers: { 'x-developer-code': devCode },
      });
      return { success: true as const };
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to update row';
      setError(msg);
      return { success: false as const, error: msg };
    }
  }, []);

  const deleteRow = useCallback(async (table: AdminDbTable, id: string, devCode: string) => {
    setError(null);
    try {
      await apiDelete(`/api/admin/db/${table}/${id}`, {
        headers: { 'x-developer-code': devCode },
      });
      return { success: true as const };
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to delete row';
      setError(msg);
      return { success: false as const, error: msg };
    }
  }, []);

  return { rows, loading, error, fetchRows, updateRow, deleteRow, setRows };
}
