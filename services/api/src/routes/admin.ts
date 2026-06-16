import type { RouteDeps } from './types.js';
import type { AuthedRequest } from '../infra.js';
import type { Response } from 'express';
import { z } from 'zod';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BULK_EMAILS = 100;
const MAX_CODES_PER_REQUEST = 100;
const CODE_PREFIX = 'DEV_';
const CODE_LENGTH = 16;
const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateDeveloperCode(): string {
  let result = CODE_PREFIX;
  for (let i = 0; i < CODE_LENGTH; i++) {
    result += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  }
  return result;
}

async function logAdminAction(
  sql: RouteDeps['sql'],
  adminId: string,
  action: string,
  resourceType: string,
  resourceId: string | null,
  details: Record<string, unknown> | null,
  ip: string | undefined
): Promise<void> {
  try {
    await sql`
      insert into admin_audit_log (admin_id, action, resource_type, resource_id, details, ip_address)
      values (${adminId}, ${action}, ${resourceType}, ${resourceId}, ${details ? JSON.stringify(details) : null}, ${ip ?? null})
    `;
  } catch {
    // non-fatal
  }
}

export function registerAdminRoutes(deps: RouteDeps): void {
  const { app, sql, infra } = deps;
  const guard = [infra.requireAuth, infra.requireGlobalAdmin];
  const DB_TABLES = new Set(['users', 'roles', 'channels', 'messages']);

  async function checkDevCodeGate(code: string | undefined): Promise<boolean> {
    const value = String(code ?? '').trim();
    if (!value) return false;
    const rows = await sql<{ id: string }[]>`select id from developer_codes where code = ${value} limit 1`;
    return !!rows[0];
  }

  // --- Whitelist ---

  app.get(
    '/api/admin/whitelist',
    ...guard,
    async (req: AuthedRequest, res: Response) => {
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const rows = await sql<{ id: string; email: string; created_at: Date }[]>`
        select id, email, created_at from email_whitelist
        order by created_at desc
        limit ${limit} offset ${offset}
      `;
      res.json({
        whitelistEmails: rows.map((r) => ({
          id: r.id,
          email: r.email,
          createdAt: r.created_at.toISOString(),
        })),
      });
    }
  );

  const addWhitelistSchema = z.object({ email: z.string().email().toLowerCase().trim() });

  app.post(
    '/api/admin/whitelist',
    ...guard,
    async (req: AuthedRequest, res: Response) => {
      const parsed = addWhitelistSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid email format' });
        return;
      }
      const email = parsed.data.email;
      const existing = await sql<{ id: string }[]>`select id from email_whitelist where email = ${email} limit 1`;
      if (existing[0]) {
        res.status(400).json({ error: 'Email already in whitelist' });
        return;
      }
      const inserted = await sql<{ id: string; email: string; created_at: Date }[]>`
        insert into email_whitelist (email) values (${email})
        returning id, email, created_at
      `;
      const row = inserted[0];
      if (!row) {
        res.status(500).json({ error: 'Failed to add email' });
        return;
      }
      await logAdminAction(sql, req.user!.id, 'whitelist_add', 'email_whitelist', row.id, { email }, req.ip);
      res.status(201).json({
        success: true,
        email: row.email,
        id: row.id,
        createdAt: row.created_at.toISOString(),
      });
    }
  );

  app.delete(
    '/api/admin/whitelist/:email',
    ...guard,
    async (req: AuthedRequest, res: Response) => {
      const emailParam = Array.isArray(req.params.email) ? req.params.email[0] : req.params.email;
      const email = decodeURIComponent(String(emailParam ?? '')).trim();
      if (!email || !EMAIL_REGEX.test(email)) {
        res.status(400).json({ error: 'Invalid email' });
        return;
      }
      const deleted = await sql<{ id: string }[]>`
        delete from email_whitelist where email = ${email}
        returning id
      `;
      if (!deleted[0]) {
        res.status(404).json({ error: 'Email not found in whitelist' });
        return;
      }
      await logAdminAction(sql, req.user!.id, 'whitelist_remove', 'email_whitelist', deleted[0].id, { email }, req.ip);
      res.json({ success: true });
    }
  );

  const bulkWhitelistSchema = z.object({
    emails: z.array(z.string().email().toLowerCase().trim()).min(1).max(MAX_BULK_EMAILS),
  });

  app.post(
    '/api/admin/whitelist/bulk',
    ...guard,
    async (req: AuthedRequest, res: Response) => {
      const parsed = bulkWhitelistSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid payload: emails array (1–' + MAX_BULK_EMAILS + ') required' });
        return;
      }
      const emails = [...new Set(parsed.data.emails)];
      const added: { id: string; email: string; createdAt: string }[] = [];
      const errors: { email: string; error: string }[] = [];
      for (const email of emails) {
        const existing = await sql<{ id: string }[]>`select id from email_whitelist where email = ${email} limit 1`;
        if (existing[0]) {
          errors.push({ email, error: 'Already in whitelist' });
          continue;
        }
        try {
          const inserted = await sql<{ id: string; email: string; created_at: Date }[]>`
            insert into email_whitelist (email) values (${email})
            returning id, email, created_at
          `;
          if (inserted[0]) {
            added.push({
              id: inserted[0].id,
              email: inserted[0].email,
              createdAt: inserted[0].created_at.toISOString(),
            });
          }
        } catch {
          errors.push({ email, error: 'Failed to add' });
        }
      }
      if (added.length) {
        await logAdminAction(
          sql,
          req.user!.id,
          'whitelist_bulk',
          'email_whitelist',
          null,
          { count: added.length, added: added.map((a) => a.email), errors: errors.length },
          req.ip
        );
      }
      res.json({ added, errors });
    }
  );

  // --- Developer codes ---

  app.get(
    '/api/admin/developer-codes',
    ...guard,
    async (req: AuthedRequest, res: Response) => {
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const usedFilter = req.query.used;
      let usedClause = sql``;
      let usedClauseCount = sql``;
      if (usedFilter === 'true') {
        usedClause = sql`and dc.used = true`;
        usedClauseCount = sql`and used = true`;
      } else if (usedFilter === 'false') {
        usedClause = sql`and dc.used = false`;
        usedClauseCount = sql`and used = false`;
      }

      const sortBy = (req.query.sortBy as string) || 'created_at';
      const order = (req.query.order as string)?.toLowerCase() === 'asc' ? sql`asc` : sql`desc`;
      let orderClause = sql`order by dc.created_at desc`;
      if (sortBy === 'code') orderClause = sql`order by dc.code ${order}`;
      else if (sortBy === 'used_at') orderClause = sql`order by dc.used_at ${order}`;
      else orderClause = sql`order by dc.created_at ${order}`;

      const rows = await sql<
        {
          id: string;
          code: string;
          used: boolean;
          used_at: Date | null;
          created_at: Date;
          used_by_id: string | null;
          used_by_email: string | null;
          used_by_name: string | null;
        }[]
      >`
        select dc.id, dc.code, dc.used, dc.used_at, dc.created_at,
               u.id as used_by_id, u.email as used_by_email, u.name as used_by_name
        from developer_codes dc
        left join users u on u.id = dc.used_by
        where true ${usedClause}
        ${orderClause}
        limit ${limit} offset ${offset}
      `;
      const totalRows = await sql<{ count: string }[]>`
        select count(*)::text as count from developer_codes where true ${usedClauseCount}
      `;
      const total = parseInt(totalRows[0]?.count ?? '0', 10);
      res.json({
        codes: rows.map((r) => ({
          id: r.id,
          code: r.code,
          used: r.used,
          usedBy: r.used_by_id
            ? { id: r.used_by_id, email: r.used_by_email ?? '', name: r.used_by_name ?? '' }
            : null,
          usedAt: r.used_at?.toISOString() ?? null,
          createdAt: r.created_at.toISOString(),
        })),
        total,
      });
    }
  );

  const createCodesSchema = z.object({
    count: z.number().int().min(1).max(MAX_CODES_PER_REQUEST).optional().default(1),
  });

  app.post(
    '/api/admin/developer-codes',
    ...guard,
    async (req: AuthedRequest, res: Response) => {
      const parsed = createCodesSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'count must be 1–' + MAX_CODES_PER_REQUEST });
        return;
      }
      const count = parsed.data.count;
      const codes: { id: string; code: string; createdAt: string }[] = [];
      const seen = new Set<string>();
      let attempts = 0;
      const maxAttempts = count * 50;
      while (codes.length < count && attempts < maxAttempts) {
        attempts++;
        const code = generateDeveloperCode();
        if (seen.has(code)) continue;
        seen.add(code);
        const existing = await sql<{ id: string }[]>`select id from developer_codes where code = ${code} limit 1`;
        if (existing[0]) continue;
        const inserted = await sql<{ id: string; code: string; created_at: Date }[]>`
          insert into developer_codes (code) values (${code})
          returning id, code, created_at
        `;
        if (inserted[0]) {
          codes.push({
            id: inserted[0].id,
            code: inserted[0].code,
            createdAt: inserted[0].created_at.toISOString(),
          });
        }
      }
      if (codes.length < count) {
        res.status(500).json({ error: 'Could not generate enough unique codes' });
        return;
      }
      await logAdminAction(
        sql,
        req.user!.id,
        'developer_codes_create',
        'developer_codes',
        null,
        { count: codes.length },
        req.ip
      );
      res.status(201).json({ success: true, codes });
    }
  );

  app.delete(
    '/api/admin/developer-codes/:codeId',
    ...guard,
    async (req: AuthedRequest, res: Response) => {
      const codeIdParam = Array.isArray(req.params.codeId) ? req.params.codeId[0] : req.params.codeId;
      const codeId = (codeIdParam ?? '').toString().trim();
      if (!codeId) {
        res.status(400).json({ error: 'codeId required' });
        return;
      }
      const row = await sql<{ used: boolean }[]>`select used from developer_codes where id = ${codeId} limit 1`;
      if (!row[0]) {
        res.status(404).json({ error: 'Code not found' });
        return;
      }
      if (row[0].used) {
        res.status(400).json({ error: 'Cannot delete used developer code' });
        return;
      }
      await sql`delete from developer_codes where id = ${codeId}`;
      await logAdminAction(sql, req.user!.id, 'developer_codes_delete', 'developer_codes', codeId, null, req.ip);
      res.json({ success: true });
    }
  );

  app.get(
    '/api/admin/developer-codes/stats',
    ...guard,
    async (req: AuthedRequest, res: Response) => {
      const stats = await sql<
        { total: string; used: string; unused: string; total_registrations: string }[]
      >`
        select
          count(*)::text as total,
          count(*) filter (where used)::text as used,
          count(*) filter (where not used)::text as unused
        from developer_codes
      `;
      const regCount = await sql<{ count: string }[]>`select count(*)::text as count from users`;
      const s = stats[0];
      res.json({
        total: parseInt(s?.total ?? '0', 10),
        used: parseInt(s?.used ?? '0', 10),
        unused: parseInt(s?.unused ?? '0', 10),
        totalRegistrations: parseInt(regCount[0]?.count ?? '0', 10),
      });
    }
  );

  // --- DB tools (safe whitelist CRUD) ---
  app.get('/api/admin/db/:table', ...guard, async (req: AuthedRequest, res: Response) => {
    const table = String(req.params.table ?? '').trim();
    if (!DB_TABLES.has(table)) {
      res.status(400).json({ error: 'Table is not allowed' });
      return;
    }
    if (!(await checkDevCodeGate(String(req.headers['x-developer-code'] ?? '')))) {
      res.status(403).json({ error: 'Invalid developer code gate' });
      return;
    }
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const q = String(req.query.q ?? '').trim();

    if (table === 'users') {
      const rows = await sql<{
        id: string; email: string; name: string; global_role: string; email_verified: boolean; created_at: Date; updated_at: Date;
      }[]>`
        select id, email, name, global_role, email_verified, created_at, updated_at
        from users
        where ${q ? sql`email ilike ${'%' + q + '%'} or name ilike ${'%' + q + '%'}` : sql`true`}
        order by created_at desc
        limit ${limit} offset ${offset}
      `;
      res.json({ rows });
      return;
    }
    if (table === 'roles') {
      const rows = await sql<{
        id: string; server_id: string; name: string; color: string; position: number; permissions: number; updated_at: Date;
      }[]>`
        select id, server_id, name, color, position, permissions, updated_at
        from roles
        where ${q ? sql`name ilike ${'%' + q + '%'}` : sql`true`}
        order by updated_at desc
        limit ${limit} offset ${offset}
      `;
      res.json({ rows });
      return;
    }
    if (table === 'channels') {
      const rows = await sql<{
        id: string; server_id: string; name: string; type: string; position: number; parent_id: string | null; topic: string | null; updated_at: Date;
      }[]>`
        select id, server_id, name, type, position, parent_id, topic, updated_at
        from channels
        where ${q ? sql`name ilike ${'%' + q + '%'}` : sql`true`}
        order by updated_at desc
        limit ${limit} offset ${offset}
      `;
      res.json({ rows });
      return;
    }
    const rows = await sql<{
      id: string; channel_id: string; user_id: string; content: string; deleted_at: Date | null; created_at: Date; updated_at: Date;
    }[]>`
      select id, channel_id, user_id, content, deleted_at, created_at, updated_at
      from messages
      where ${q ? sql`content ilike ${'%' + q + '%'}` : sql`true`}
      order by created_at desc
      limit ${limit} offset ${offset}
    `;
    res.json({ rows });
  });

  app.patch('/api/admin/db/:table/:id', ...guard, async (req: AuthedRequest, res: Response) => {
    const table = String(req.params.table ?? '').trim();
    const id = String(req.params.id ?? '').trim();
    if (!DB_TABLES.has(table) || !id) {
      res.status(400).json({ error: 'Invalid table or id' });
      return;
    }
    if (!(await checkDevCodeGate(String(req.headers['x-developer-code'] ?? '')))) {
      res.status(403).json({ error: 'Invalid developer code gate' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;

    if (table === 'users') {
      await sql`
        update users
        set
          name = coalesce(${typeof body.name === 'string' ? body.name : null}, name),
          global_role = coalesce(${typeof body.global_role === 'string' ? body.global_role : null}, global_role),
          email_verified = coalesce(${typeof body.email_verified === 'boolean' ? body.email_verified : null}, email_verified),
          updated_at = now()
        where id = ${id}
      `;
    } else if (table === 'roles') {
      await sql`
        update roles
        set
          name = coalesce(${typeof body.name === 'string' ? body.name : null}, name),
          color = coalesce(${typeof body.color === 'string' ? body.color : null}, color),
          position = coalesce(${typeof body.position === 'number' ? body.position : null}, position),
          permissions = coalesce(${typeof body.permissions === 'number' ? body.permissions : null}, permissions),
          updated_at = now()
        where id = ${id}
      `;
    } else if (table === 'channels') {
      await sql`
        update channels
        set
          name = coalesce(${typeof body.name === 'string' ? body.name : null}, name),
          topic = coalesce(${typeof body.topic === 'string' ? body.topic : null}, topic),
          position = coalesce(${typeof body.position === 'number' ? body.position : null}, position),
          parent_id = coalesce(${typeof body.parent_id === 'string' ? body.parent_id : null}, parent_id),
          updated_at = now()
        where id = ${id}
      `;
    } else if (table === 'messages') {
      await sql`
        update messages
        set
          content = coalesce(${typeof body.content === 'string' ? body.content : null}, content),
          updated_at = now()
        where id = ${id}
      `;
    }

    await logAdminAction(sql, req.user!.id, 'db_update', table, id, body, req.ip);
    res.json({ success: true });
  });

  app.delete('/api/admin/db/:table/:id', ...guard, async (req: AuthedRequest, res: Response) => {
    const table = String(req.params.table ?? '').trim();
    const id = String(req.params.id ?? '').trim();
    if (!DB_TABLES.has(table) || !id) {
      res.status(400).json({ error: 'Invalid table or id' });
      return;
    }
    if (!(await checkDevCodeGate(String(req.headers['x-developer-code'] ?? '')))) {
      res.status(403).json({ error: 'Invalid developer code gate' });
      return;
    }
    if (table === 'messages') {
      await sql`update messages set deleted_at = now(), updated_at = now() where id = ${id}`;
    } else if (table === 'users') {
      await sql`delete from users where id = ${id}`;
    } else if (table === 'roles') {
      await sql`delete from roles where id = ${id}`;
    } else if (table === 'channels') {
      await sql`delete from channels where id = ${id}`;
    }
    await logAdminAction(sql, req.user!.id, 'db_delete', table, id, null, req.ip);
    res.json({ success: true });
  });
}
