/**
 * SECURITY: Post-build check. Fails if client bundle contains secret patterns.
 * Run after `next build`. Scans .next/static for leaked env/keys.
 */
const fs = require('fs');
const path = require('path');

const FORBIDDEN_PATTERNS = [
  'LIVEKIT_API_SECRET',
  'LIVEKIT_API_KEY',
  'DATABASE_URL',
  'SERVICE_ROLE_KEY',
  'NVIDIA_API_KEY',
];

const STATIC_DIR = path.join(process.cwd(), '.next', 'static');

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const found = [];
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (content.includes(pattern)) {
      found.push(pattern);
    }
  }
  return found;
}

function walkDir(dir, extensions = ['.js', '.css']) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  try {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        results.push(...walkDir(full, extensions));
      } else if (extensions.some((ext) => name.endsWith(ext))) {
        results.push(full);
      }
    }
  } catch (e) {
    // ignore
  }
  return results;
}

function main() {
  if (!fs.existsSync(STATIC_DIR)) {
    console.log('[check-bundle-secrets] No .next/static found, skipping (run after next build)');
    process.exit(0);
    return;
  }

  const files = walkDir(STATIC_DIR);
  let failed = false;
  for (const file of files) {
    const rel = path.relative(process.cwd(), file);
    const found = scanFile(file);
    if (found.length > 0) {
      console.error(`[check-bundle-secrets] LEAK in ${rel}: ${found.join(', ')}`);
      failed = true;
    }
  }
  if (failed) {
    console.error('[check-bundle-secrets] Build failed: secret patterns found in client bundle.');
    process.exit(1);
  }
  console.log('[check-bundle-secrets] OK: no forbidden patterns in .next/static');
  process.exit(0);
}

main();
