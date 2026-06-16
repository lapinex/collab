import { Suspense } from 'react';
import { LoginClient } from './LoginClient';

// Prevent CDN/edge caching mixing RSC and full HTML.
export const dynamic = 'force-dynamic';

function LoginFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-green-primary border-t-transparent mb-4" />
        <div className="text-text-secondary">Loading...</div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginClient />
    </Suspense>
  );
}
