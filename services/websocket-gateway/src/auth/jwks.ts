import jwt from 'jsonwebtoken';

type JwtPayload = {
  sub?: string;
  email?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  role?: string;
  type?: string;
};

const JWT_SECRET = process.env.WS_JWT_SECRET || process.env.JWT_SECRET;
const ISSUER = process.env.AUTH_BEARER_ISSUER || 'collab-api';
const AUDIENCE = process.env.AUTH_BEARER_AUDIENCE || 'collab-web';
const API_URL = process.env.API_URL || 'http://localhost:4000';

/**
 * Verify JWT by delegating to API instead of local verification.
 * This ensures the API is the single source of truth for token validation.
 */
export async function verifyJwt(token: string): Promise<{
  userId: string;
  email?: string;
  iss: string;
  aud: string | string[];
  exp: number;
  role?: string;
}> {
  try {
    // Call API to verify token (API is source of truth)
    const response = await fetch(`${API_URL}/api/auth/verify-token`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API returned ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.valid || !data.user) {
      throw new Error('Token validation failed');
    }

    // Return standard format expected by connection handler
    return {
      userId: data.user.id,
      email: data.user.email,
      iss: ISSUER,
      aud: AUDIENCE,
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      role: data.user.globalRole || 'user',
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Token verification failed: ${errorMsg}`);
  }
}

