'use client';

import { useState, FormEvent } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { registerSchema } from '@/lib/auth/validation';
import { USER_LIMITS } from '@/lib/constants';
import { LicenseModal } from '@/components/modals/LicenseModal';

export function RegisterForm() {
  const { register, isLoading, error } = useAuth({ autoCheck: false });
  const [formError, setFormError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [developerCode, setDeveloperCode] = useState('');
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [licenseAccepted, setLicenseAccepted] = useState(false);

  const validatePassword = (pwd: string): string | null => {
    if (pwd.length < USER_LIMITS.MIN_PASSWORD_LENGTH) {
      return `Password must be at least ${USER_LIMITS.MIN_PASSWORD_LENGTH} characters`;
    }
    if (!/[A-Z]/.test(pwd)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!/[a-z]/.test(pwd)) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!/[0-9]/.test(pwd)) {
      return 'Password must contain at least one number';
    }
    return null;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    if (!licenseAccepted) {
      setShowLicenseModal(true);
      return;
    }

    // Password validation
    const passwordError = validatePassword(password);
    if (passwordError) {
      setFormError(passwordError);
      return;
    }

    // Zod validation
    try {
      registerSchema.parse({ email, password, name, developerCode });
    } catch (validationError) {
      if (validationError instanceof Error) {
        setFormError(validationError.message);
      } else {
        setFormError('Invalid form data');
      }
      return;
    }

    // Submit
    const result = await register({ email, password, name, developerCode });
    if (!result.success) {
      setFormError(result.error || 'Registration failed');
    }
  };

  const handleLicenseAccept = () => {
    setLicenseAccepted(true);
    setShowLicenseModal(false);
  };

  const displayError = formError || error;

  return (
    <form onSubmit={handleSubmit} className="space-y-5 w-full max-w-md">
      <div className="space-y-2">
        <label htmlFor="name" className="text-sm font-medium text-text-primary uppercase tracking-wide">
          Name
        </label>
        <Input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          required
          disabled={isLoading}
          minLength={USER_LIMITS.MIN_USERNAME_LENGTH}
          maxLength={USER_LIMITS.MAX_USERNAME_LENGTH}
          autoComplete="name"
        />
      </div>

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
          placeholder="8+ chars, uppercase, lowercase, number"
          required
          disabled={isLoading}
          autoComplete="new-password"
          minLength={8}
        />
        <p className="text-xs text-text-muted">
          Must contain: uppercase, lowercase, number, 8+ characters
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="developerCode" className="text-sm font-medium text-text-primary uppercase tracking-wide">
          Developer Code
        </label>
        <Input
          id="developerCode"
          type="text"
          value={developerCode}
          onChange={(e) => setDeveloperCode(e.target.value)}
          placeholder="Enter developer code"
          required
          disabled={isLoading}
        />
        <p className="text-xs text-text-muted">
          Required for registration. Contact admin if you don&apos;t have one.
        </p>
      </div>

      {/* License Acceptance */}
      <div className="flex items-start gap-3 rounded-md bg-blue-50 dark:bg-blue-900/20 p-4">
        <input
          id="license"
          type="checkbox"
          checked={licenseAccepted}
          onChange={(e) => {
            if (!e.target.checked) {
              setLicenseAccepted(false);
            } else {
              setShowLicenseModal(true);
            }
          }}
          disabled={isLoading}
          className="mt-1 h-4 w-4 cursor-pointer"
        />
        <label htmlFor="license" className="text-sm text-text-primary cursor-pointer">
          I have read and accept the{' '}
          <button
            type="button"
            onClick={() => setShowLicenseModal(true)}
            className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
          >
            License Agreement
          </button>
        </label>
      </div>

      {displayError && (
        <div className="text-sm text-danger bg-danger/10 border border-danger/20 p-3 rounded-md">
          {displayError}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={isLoading || !licenseAccepted}>
        {isLoading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Registering...
          </span>
        ) : (
          'Register'
        )}
      </Button>

      {/* License Modal */}
      {showLicenseModal && (
        <LicenseModal
          isRequired={true}
          isLoading={false}
          onAccept={handleLicenseAccept}
          onReject={() => setShowLicenseModal(false)}
        />
      )}
    </form>
  );
}
