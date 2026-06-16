import { describe, it, expect } from '@jest/globals';

describe('Registration Smoke Test', () => {
  it('should validate registration endpoint exists', async () => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    
    // Test that endpoint exists (will fail without valid data, but endpoint should be accessible)
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'Test1234!',
        name: 'Test User',
        developerCode: 'invalid',
      }),
    });

    // Should return 400 (validation error) or 403 (not whitelisted), not 404
    expect(response.status).not.toBe(404);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });
});
