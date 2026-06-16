'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';

function JoinContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [code, setCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [serverName, setServerName] = useState<string | null>(null);

  // Get code from URL query params
  useEffect(() => {
    const codeParam = searchParams.get('code');
    if (codeParam) {
      setCode(codeParam);
    }
  }, [searchParams]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push(`/login?redirect=/join${code ? `?code=${code}` : ''}`);
    }
  }, [isAuthenticated, authLoading, router, code]);

  const handleJoin = async () => {
    if (!code.trim()) {
      setError('Please enter an invitation code');
      return;
    }

    setIsJoining(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch('/api/servers/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code: code.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to join server');
      }

      setSuccess(true);
      setServerName(data.server?.name || 'the server');

      // Redirect to app after 2 seconds
      setTimeout(() => {
        router.push('/app');
      }, 2000);
    } catch (err) {
      console.error('Failed to join server:', err);
      setError(err instanceof Error ? err.message : 'Failed to join server');
    } finally {
      setIsJoining(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-green-primary border-t-transparent mb-4" />
          <div className="text-text-secondary">Loading...</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Redirecting to login
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2">Join a Server</h1>
          <p className="text-text-muted">
            Enter an invitation code to join a server
          </p>
        </div>

        {success ? (
          <div className="bg-success/20 border border-success/30 rounded-md p-4 text-center">
            <div className="text-success font-semibold mb-2">Success!</div>
            <div className="text-sm text-text-muted">
              You&apos;ve joined {serverName}. Redirecting...
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {error && (
              <div className="bg-danger/20 text-danger p-3 rounded-md text-sm">
                {error}
              </div>
            )}

            <div>
              <Label htmlFor="invitation-code">Invitation Code</Label>
              <Input
                id="invitation-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Enter invitation code"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void handleJoin();
                  }
                }}
                disabled={isJoining}
                className="font-mono"
              />
              <p className="text-xs text-text-muted mt-1">
                You can find invitation codes in the server settings
              </p>
            </div>

            <Button
              onClick={handleJoin}
              disabled={isJoining || !code.trim()}
              className="w-full"
            >
              {isJoining ? 'Joining...' : 'Join Server'}
            </Button>

            <div className="text-center">
              <Link href="/app" className="text-sm text-text-muted hover:text-text-primary">
                Back to app
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-bg-primary">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-green-primary border-t-transparent mb-4" />
            <div className="text-text-secondary">Loading...</div>
          </div>
        </div>
      }
    >
      <JoinContent />
    </Suspense>
  );
}
