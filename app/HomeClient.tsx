'use client';

import { useState } from 'react';
import { LoginForm } from '@/components/auth/LoginForm';
import { RegisterForm } from '@/components/auth/RegisterForm';

export function HomeClient() {
  const [isLogin, setIsLogin] = useState(true);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-green-primary/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-green-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-green-primary mb-4">
            <span className="text-3xl font-bold text-bg-primary">C</span>
          </div>
          <h1 className="text-4xl font-bold text-text-primary">Collab</h1>
          <p className="mt-2 text-lg text-text-secondary">Private messenger for your team</p>
        </div>

        <div className="bg-bg-secondary border border-border-primary rounded-lg p-6 shadow-xl">
          <h2 className="text-xl font-semibold text-text-primary mb-6 text-center">
            {isLogin ? 'Welcome back' : 'Create an account'}
          </h2>

          {isLogin ? <LoginForm /> : <RegisterForm />}

          <div className="mt-6 text-center text-sm">
            <span className="text-text-secondary">
              {isLogin ? "Don't have an account? " : 'Already have an account? '}
            </span>
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-green-primary hover:text-green-hover hover:underline transition-colors"
            >
              {isLogin ? 'Register' : 'Login'}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-text-muted">
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}

