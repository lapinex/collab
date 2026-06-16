import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHmac } from 'crypto';

if (!process.env.CSRF_SECRET) {
  throw new Error('CSRF_SECRET is not set');
}

const CSRF_SECRET = process.env.CSRF_SECRET;

export function generateCSRFToken(): string {
  const token = randomBytes(32).toString('hex');
  return token;
}

export function signCSRFToken(token: string): string {
  const hmac = createHmac('sha256', CSRF_SECRET);
  hmac.update(token);
  const signature = hmac.digest('hex');
  return `${token}.${signature}`;
}

export function verifyCSRFToken(signedToken: string): boolean {
  const [token, signature] = signedToken.split('.');

  if (!token || !signature) {
    return false;
  }

  const expectedSignature = createHmac('sha256', CSRF_SECRET)
    .update(token)
    .digest('hex');

  return signature === expectedSignature;
}

export function getCSRFToken(request: NextRequest): string | null {
  // Try header first
  const headerToken = request.headers.get('x-csrf-token');
  if (headerToken) {
    return headerToken;
  }

  // Try cookie
  const cookieToken = request.cookies.get('csrf-token')?.value;
  if (cookieToken) {
    return cookieToken;
  }

  return null;
}

export function setCSRFToken(response: NextResponse, token: string): void {
  const signedToken = signCSRFToken(token);
  response.cookies.set('csrf-token', signedToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });
}

export function validateCSRF(
  request: NextRequest
): { valid: boolean; error?: string } {
  // Skip GET, HEAD, OPTIONS requests
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    return { valid: true };
  }

  const token = getCSRFToken(request);

  if (!token) {
    return { valid: false, error: 'CSRF token missing' };
  }

  if (!verifyCSRFToken(token)) {
    return { valid: false, error: 'Invalid CSRF token' };
  }

  return { valid: true };
}
