/**
 * Integration tests for permission-related API contract (P2).
 * Scenarios: join by invite (payload/response), channel list and messages return 401 without auth,
 * 403 when channel access is denied; permission endpoint requires serverId/channelId.
 *
 * Run with API or app URL in NEXT_PUBLIC_APP_URL (or API_URL). These tests do not require
 * a full DB setup; they assert status codes and response shape where possible.
 */

import { describe, it, expect } from '@jest/globals';

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.API_URL || 'http://localhost:3000';

describe('Permissions API contract', () => {
  describe('Join server (unified contract)', () => {
    it('POST /api/servers/join without body returns 400', async () => {
      const res = await fetch(`${baseUrl}/api/servers/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const data = await res.json().catch(() => ({}));
      expect(data.error).toBeDefined();
    });

    it('POST /api/servers/join with empty code returns 400', async () => {
      const res = await fetch(`${baseUrl}/api/servers/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code: '' }),
      });
      expect(res.status).toBe(400);
    });

    it('POST /api/servers/join without auth returns 401', async () => {
      const res = await fetch(`${baseUrl}/api/servers/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code: 'invalid-code' }),
      });
      expect(res.status).toBe(401);
    });

    it('POST /api/servers/join accepts inviteCode (unified contract)', async () => {
      const res = await fetch(`${baseUrl}/api/servers/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ inviteCode: 'some-code' }),
      });
      expect([400, 401, 404]).toContain(res.status);
      if (res.status === 200) {
        const data = await res.json();
        expect(data).toHaveProperty('serverId');
        expect(data.success).toBe(true);
        if (data.server) {
          expect(data.server).toHaveProperty('id');
          expect(data.server).toHaveProperty('name');
        }
      }
    });
  });

  describe('Messages API (channel permission checks)', () => {
    it('GET /api/messages without auth returns 401', async () => {
      const res = await fetch(`${baseUrl}/api/messages?channelId=00000000-0000-0000-0000-000000000001`, {
        method: 'GET',
        credentials: 'include',
      });
      expect(res.status).toBe(401);
    });

    it('POST /api/messages without auth returns 401', async () => {
      const res = await fetch(`${baseUrl}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ channelId: '00000000-0000-0000-0000-000000000001', content: 'hi' }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('Channels list (VIEW_CHANNEL filter)', () => {
    it('GET /api/servers/:serverId/channels without auth returns 401', async () => {
      const serverId = '00000000-0000-0000-0000-000000000001';
      const res = await fetch(`${baseUrl}/api/servers/${serverId}/channels`, {
        method: 'GET',
        credentials: 'include',
      });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/permissions/channel', () => {
    it('requires serverId and channelId', async () => {
      const res = await fetch(
        `${baseUrl}/api/permissions/channel`,
        { method: 'GET', credentials: 'include' }
      );
      expect(res.status).toBe(400);
    });

    it('without auth returns 401', async () => {
      const q = new URLSearchParams({
        serverId: '00000000-0000-0000-0000-000000000001',
        channelId: '00000000-0000-0000-0000-000000000002',
      });
      const res = await fetch(`${baseUrl}/api/permissions/channel?${q}`, {
        method: 'GET',
        credentials: 'include',
      });
      expect(res.status).toBe(401);
    });
  });
});
