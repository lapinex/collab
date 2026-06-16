import { describe, it, expect } from '@jest/globals';

describe('Voice Smoke Test', () => {
  it('should validate voice join endpoint exists', async () => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    
    // Test that endpoint exists (will fail without auth, but endpoint should be accessible)
    const response = await fetch(`${baseUrl}/api/voice/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channelId: 'test',
      }),
    });

    // Should return 401 (unauthorized), not 404
    expect(response.status).not.toBe(404);
    expect([401, 403]).toContain(response.status);
  });

  it('should validate voice participants endpoint exists', async () => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    
    const response = await fetch(`${baseUrl}/api/voice/participants?channelId=test`, {
      method: 'GET',
    });

    // Should return 401 (unauthorized), not 404
    expect(response.status).not.toBe(404);
    expect([401, 403]).toContain(response.status);
  });
});
