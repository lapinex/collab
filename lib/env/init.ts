import { assertEnv } from './validation';

// Validate environment variables on module load
if (typeof window === 'undefined') {
  // Only run on server side
  try {
    assertEnv();
  } catch (error) {
    console.error('Environment validation failed:', error);
    process.exit(1);
  }
}
