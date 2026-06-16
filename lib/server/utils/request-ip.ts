import { NextRequest } from 'next/server';

export function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  
  if (!forwardedFor) {
    return realIp || 'unknown';
  }
  
  const ips = forwardedFor.split(',');
  return ips[0]?.trim() || realIp || 'unknown';
}
