import jwt, { type SignOptions } from 'jsonwebtoken';
import type { JWTPayload } from '@/types/auth';

// Lazy initialization for JWT secrets
let JWT_SECRET: string | null = null;
let JWT_REFRESH_SECRET: string | null = null;

function getJwtSecret(): string {
  if (!JWT_SECRET) {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not set');
    }
    JWT_SECRET = process.env.JWT_SECRET;
  }
  return JWT_SECRET;
}

function getJwtRefreshSecret(): string {
  if (!JWT_REFRESH_SECRET) {
    if (!process.env.JWT_REFRESH_SECRET) {
      throw new Error('JWT_REFRESH_SECRET is not set');
    }
    JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
  }
  return JWT_REFRESH_SECRET;
}

const JWT_ACCESS_EXPIRES_IN: string = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_IN: string = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

export function signAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, getJwtSecret(), {
    algorithm: 'HS256',
    expiresIn: JWT_ACCESS_EXPIRES_IN,
  } as SignOptions);
}

export function signRefreshToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, getJwtRefreshSecret(), {
    algorithm: 'HS256',
    expiresIn: JWT_REFRESH_EXPIRES_IN,
  } as SignOptions);
}

export function verifyAccessToken(token: string): JWTPayload {
  try {
    const decoded = jwt.verify(token, getJwtSecret(), {
      algorithms: ['HS256'],
    }) as JWTPayload;
    return decoded;
  } catch (_error) {
    throw new Error('Invalid access token');
  }
}

export function verifyRefreshToken(token: string): JWTPayload {
  try {
    const decoded = jwt.verify(token, getJwtRefreshSecret(), {
      algorithms: ['HS256'],
    }) as JWTPayload;
    return decoded;
  } catch (_error) {
    throw new Error('Invalid refresh token');
  }
}

export function decodeToken(token: string): JWTPayload | null {
  try {
    return jwt.decode(token) as JWTPayload;
  } catch {
    return null;
  }
}
