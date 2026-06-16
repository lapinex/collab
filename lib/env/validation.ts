const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
] as const;

export interface EnvValidationResult {
  valid: boolean;
  missing: string[];
  errors: string[];
}

export function validateEnv(): EnvValidationResult {
  const missing: string[] = [];
  const errors: string[] = [];

  // Check required variables
  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  // Validate JWT secrets (must be different in production)
  if (process.env.JWT_SECRET && process.env.JWT_REFRESH_SECRET) {
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET
    ) {
      errors.push('JWT_SECRET and JWT_REFRESH_SECRET must be different in production');
    }

    if (process.env.JWT_SECRET.length < 32) {
      errors.push('JWT_SECRET must be at least 32 characters long');
    }

    if (process.env.JWT_REFRESH_SECRET.length < 32) {
      errors.push('JWT_REFRESH_SECRET must be at least 32 characters long');
    }
  }

  // Validate DATABASE_URL format for PostgreSQL
  if (process.env.DATABASE_URL) {
    const dbUrl = process.env.DATABASE_URL;
    const isPostgres = dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://');
    if (!isPostgres) {
      errors.push('DATABASE_URL must be a valid PostgreSQL connection string (e.g., postgresql://user:password@host:port/database)');
    }
  }

  // Validate REDIS_URL format
  if (process.env.REDIS_URL && !process.env.REDIS_URL.startsWith('redis://') && !process.env.REDIS_URL.startsWith('rediss://')) {
    errors.push('REDIS_URL must be a valid Redis connection string');
  }

  return {
    valid: missing.length === 0 && errors.length === 0,
    missing,
    errors,
  };
}

export function assertEnv(): void {
  const result = validateEnv();

  if (!result.valid) {
    const messages: string[] = [];

    if (result.missing.length > 0) {
      messages.push(`Missing required environment variables: ${result.missing.join(', ')}`);
    }

    if (result.errors.length > 0) {
      messages.push(`Environment validation errors: ${result.errors.join(', ')}`);
    }

    throw new Error(messages.join('\n'));
  }
}
