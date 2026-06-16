import { describe, it, expect } from '@jest/globals';

describe('Messages Smoke Test', () => {
  it('should validate messages endpoint exists', async () => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    
    // Test that endpoint exists (will fail without auth, but endpoint should be accessible)
    const response = await fetch(`${baseUrl}/api/messages?channelId=test`, {
      method: 'GET',
    });

    // Should return 401 (unauthorized), not 404
    expect(response.status).not.toBe(404);
    expect([401, 403]).toContain(response.status);
  });

  it('should validate message creation endpoint exists', async () => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    
    const response = await fetch(`${baseUrl}/api/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channelId: 'test',
        content: 'test',
      }),
    });

    // Should return 401 (unauthorized), not 404
    expect(response.status).not.toBe(404);
    expect([401, 403]).toContain(response.status);
  });
});
