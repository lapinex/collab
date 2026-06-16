import { NextRequest, NextResponse } from 'next/server';
import { clientEnv } from '@/lib/env/clientEnv';

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  clientEnv.appUrl,
].filter(Boolean) as string[];

// Allowed methods
const allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

// Allowed headers
const allowedHeaders = [
  'Content-Type',
  'Authorization',
  'X-Requested-With',
  'X-CSRF-Token',
];

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin');
  const isAllowedOrigin = !origin || allowedOrigins.includes(origin);
  const pathname = request.nextUrl.pathname;

  // Handle OPTIONS preflight requests
  if (request.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 200 });
    
    // Set CORS headers
    if (isAllowedOrigin && origin) {
      response.headers.set('Access-Control-Allow-Origin', origin);
    }
    response.headers.set('Access-Control-Allow-Methods', allowedMethods.join(', '));
    response.headers.set('Access-Control-Allow-Headers', allowedHeaders.join(', '));
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Max-Age', '86400'); // 24 hours
    
    return response;
  }

  // Protect /app routes - check for access token cookie
  // НЕ делаем редирект на /login чтобы избежать циклов
  // Проверка авторизации будет на клиенте
  if (pathname.startsWith('/app')) {
    const accessToken = request.cookies.get('collab_access');
    
    if (!accessToken) {
      // Просто редиректим на главную страницу (не на /login)
      // Главная сама покажет форму логина
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // For all other requests, add CORS headers to the response
  const response = NextResponse.next();
  
  if (isAllowedOrigin && origin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
  }
  response.headers.set('Access-Control-Allow-Methods', allowedMethods.join(', '));
  response.headers.set('Access-Control-Allow-Headers', allowedHeaders.join(', '));
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  
  return response;
}

// Configure which routes the middleware should run on
// НЕ включаем / и /login чтобы избежать циклов
export const config = {
  matcher: [
    '/api/:path*',
    '/app/:path*',
  ],
};
