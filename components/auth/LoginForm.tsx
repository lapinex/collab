'use client';

import { useState, FormEvent } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { loginSchema } from '@/lib/auth/validation';
import { apiPost } from '@/lib/api-client';

export function LoginForm() {
  const { login, isLoading, error } = useAuth({ autoCheck: false });
  const [formError, setFormError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showResetPanel, setShowResetPanel] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [developerCode, setDeveloperCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    // Validation
    try {
      loginSchema.parse({ email, password });
    } catch (validationError) {
      if (validationError instanceof Error) {
        setFormError(validationError.message);
      } else {
        setFormError('Invalid email or password format');
      }
      return;
    }

    // Submit
    const result = await login({ email, password });
    if (!result.success) {
      setFormError(result.error || 'Login failed');
    }
  };

  const displayError = formError || error;

  const requestReset = async () => {
    if (!resetEmail.trim() || !developerCode.trim()) {
      setResetError('Email and developer code are required');
      return;
    }
    setResetBusy(true);
    setResetError(null);
    setResetSuccess(null);
    try {
      const response = await apiPost<{ success: boolean; resetToken?: string }>(
        '/api/auth/password/forgot',
        { email: resetEmail.trim(), developerCode: developerCode.trim() },
        { skipAuth: true }
      );
      if (response.resetToken) setResetToken(response.resetToken);
      setResetSuccess('Reset token requested. Use token and set a new password.');
    } catch (e) {
      setResetError(e instanceof Error ? e.message : 'Failed to request reset token');
    } finally {
      setResetBusy(false);
    }
  };

  const confirmReset = async () => {
    if (!resetToken.trim() || !resetEmail.trim() || !newPassword.trim()) {
      setResetError('Email, token and new password are required');
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError('Passwords do not match');
      return;
    }
    setResetBusy(true);
    setResetError(null);
    setResetSuccess(null);
    try {
      await apiPost<{ success: boolean }>(
        '/api/auth/password/reset',
        {
          token: resetToken.trim(),
          email: resetEmail.trim(),
          newPassword,
        },
        { skipAuth: true }
      );
      setResetSuccess('Password changed. Now sign in with your new password.');
      setPassword('');
    } catch (e) {
      setResetError(e instanceof Error ? e.message : 'Failed to reset password');
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 w-full max-w-md">
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium text-text-primary uppercase tracking-wide">
          Email
        </label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          disabled={isLoading}
          autoComplete="email"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium text-text-primary uppercase tracking-wide">
          Password
        </label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password"
          required
          disabled={isLoading}
          autoComplete="current-password"
        />
      </div>

      {displayError && (
        <div className="text-sm text-danger bg-danger/10 border border-danger/20 p-3 rounded-md">
          {displayError}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Logging in...
          </span>
        ) : (
          'Login'
        )}
      </Button>

      <div className="pt-1">
        <button
          type="button"
          className="text-sm text-green-primary hover:underline"
          onClick={() => {
            setShowResetPanel((v) => !v);
            setResetError(null);
            setResetSuccess(null);
            if (!resetEmail) setResetEmail(email);
          }}
        >
          {showResetPanel ? 'Hide password reset' : 'Forgot password?'}
        </button>
      </div>

      {showResetPanel && (
        <div className="space-y-3 rounded-md border border-border-primary p-3">
          <Input
            type="email"
            placeholder="Email"
            value={resetEmail}
            onChange={(e) => setResetEmail(e.target.value)}
            disabled={resetBusy}
          />
          <Input
            type="text"
            placeholder="Developer code (temporary)"
            value={developerCode}
            onChange={(e) => setDeveloperCode(e.target.value)}
            disabled={resetBusy}
          />
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={requestReset} disabled={resetBusy} className="flex-1">
              Request token
            </Button>
          </div>
          <Input
            type="text"
            placeholder="Reset token"
            value={resetToken}
            onChange={(e) => setResetToken(e.target.value)}
            disabled={resetBusy}
          />
          <Input
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={resetBusy}
          />
          <Input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={resetBusy}
          />
          <Button type="button" onClick={confirmReset} disabled={resetBusy} className="w-full">
            Set new password
          </Button>
          {resetError && <div className="text-sm text-danger">{resetError}</div>}
          {resetSuccess && <div className="text-sm text-green-primary">{resetSuccess}</div>}
        </div>
      )}
    </form>
  );
}
