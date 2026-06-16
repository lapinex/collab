# Migration Guide: HS256 → ES256 (Supabase Auth)

## Summary

**Problem**: Gateway was receiving HS256 tokens from custom auth, but only accepts ES256 tokens from Supabase Auth.

**Solution**: Gateway now **ONLY accepts Supabase access_token** (ES256) verified via Supabase JWKS.

## Why HS256 Was Removed

### Security Issues with HS256

1. **Shared Secret Risk**: HS256 requires a shared secret stored in environment variables
   - If secret leaks, attackers can forge tokens
   - Secret rotation is complex and risky
   - No key rotation without downtime

2. **Not Production-Ready**: 
   - Discord, Slack, GitHub use ES256/RS256 (asymmetric)
   - HS256 is symmetric (same key for sign/verify)
   - Industry standard is asymmetric keys

3. **Supabase Standard**: 
   - Supabase Auth uses ES256 (ECC P-256) for access tokens
   - Legacy HS256 support is deprecated
   - All new Supabase projects use ES256

### Benefits of ES256

1. **No Secrets**: Uses public keys from JWKS (no secrets to leak)
2. **Key Rotation**: Supabase can rotate keys without breaking existing tokens
3. **Industry Standard**: Same approach as Discord, Slack, GitHub
4. **Production-Ready**: Battle-tested in production environments

## Code Changes

### 1. Gateway (`services/websocket-gateway/src/auth/jwks.ts`)

**Removed**:
- `getHs256Secret()` function
- HS256 verification logic
- Support for `HS256_SECRET` env var

**Updated**:
- Only ES256 verification via JWKS
- JWKS endpoint: `https://<project-ref>.supabase.co/auth/v1/keys`
- EC P-256 keys only (kty: "EC", crv: "P-256")
- Fail-fast: rejects non-ES256 tokens immediately

### 2. WS Token Endpoint (`app/api/auth/ws-token/route.ts`)

**Before**:
```typescript
// Returned custom HS256 token from cookie
const token = request.cookies.get('accessToken')?.value;
return NextResponse.json({ token });
```

**After**:
```typescript
// Returns Supabase access_token from Supabase session cookie
const token = await getSupabaseAccessToken();
return NextResponse.json({ token });
```

### 3. New Supabase Helper (`lib/auth/supabase.ts`)

Created helper to extract Supabase access_token:
- Reads from Supabase auth cookie: `sb-access-token`
- Fallback to Authorization header
- Validates token format

## Frontend Integration

### Current Implementation

The current `useWebSocket` hook already uses `/api/auth/ws-token`:

```typescript
// hooks/useWebSocket.ts (current - works with new endpoint)
const res = await fetch('/api/auth/ws-token', { credentials: 'include' });
const { token } = await res.json();
// token is now Supabase access_token (ES256)
```

**No changes needed** - the endpoint now returns Supabase token automatically.

### Alternative: Direct Supabase Client

If you want to use Supabase client directly:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Get session
const { data: { session } } = await supabase.auth.getSession();

if (session?.access_token) {
  // Use Supabase access_token directly
  const ws = useWebSocket(session.access_token);
}
```

## Environment Variables

### Removed

```bash
# ❌ NO LONGER NEEDED
HS256_SECRET=...
```

### Required (Gateway)

```bash
# .env.gateway
SUPABASE_URL=https://<project-ref>.supabase.co

# Optional
SUPABASE_ANON_KEY=...  # For JWKS endpoint auth (if required)
SUPABASE_JWT_AUD=authenticated  # Default: 'authenticated'
```

### Required (Frontend)

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Verification Flow

```
1. Frontend gets Supabase session
   ↓
2. /api/auth/ws-token extracts access_token
   ↓
3. Frontend connects: ws://gateway?token=<supabase-access-token>
   ↓
4. Gateway decodes header → alg: "ES256" ✅
   ↓
5. Gateway loads JWKS from Supabase
   ↓
6. Gateway finds EC key by kid
   ↓
7. Gateway verifies signature (ES256)
   ↓
8. Gateway validates: iss, aud, exp, sub
   ↓
9. Gateway checks user exists in DB
   ↓
10. Connection authenticated ✅
```

## Testing

### 1. Verify Gateway Accepts ES256

```bash
# Get Supabase access_token (from browser console)
# Token header should be: {"alg":"ES256","typ":"JWT","kid":"..."}

# Test connection
wscat -c "ws://localhost:8080?token=<supabase-access-token>"

# Check Gateway logs:
# ✅ "[JWKS] Loaded X EC key(s)"
# ✅ "[JWT] Verification successful"
# ❌ Should NOT see: "Unsupported JWT algorithm: HS256"
```

### 2. Verify HS256 is Rejected

```bash
# Try with old HS256 token
wscat -c "ws://localhost:8080?token=<old-hs256-token>"

# Gateway should reject immediately:
# ❌ "Unsupported JWT algorithm: HS256. Only ES256 is supported."
```

## Troubleshooting

### Error: "Unsupported JWT algorithm: HS256"

**Cause**: Frontend is still sending custom HS256 token.

**Fix**:
1. Check `/api/auth/ws-token` returns Supabase access_token
2. Verify Supabase session cookie exists
3. Ensure frontend uses Supabase session, not custom token

### Error: "JWT kid not found in JWKS"

**Cause**: Token's `kid` doesn't match Supabase JWKS.

**Fix**:
1. Ensure token is from correct Supabase project
2. Check `SUPABASE_URL` matches token issuer
3. Verify JWKS endpoint is accessible

### Error: "JWKS fetch failed: HTTP 401"

**Cause**: JWKS endpoint requires authentication.

**Fix**:
1. Set `SUPABASE_ANON_KEY` in `.env.gateway`
2. Verify anon key is correct
3. Check Supabase project settings

## Files Changed

1. ✅ `services/websocket-gateway/src/auth/jwks.ts` - ES256 only
2. ✅ `services/websocket-gateway/src/connection.ts` - Updated comments
3. ✅ `app/api/auth/ws-token/route.ts` - Returns Supabase token
4. ✅ `lib/auth/supabase.ts` - New helper (created)
5. ✅ `services/websocket-gateway/AUTH_CHANGES.md` - Documentation

## Next Steps

1. **Remove HS256_SECRET** from `.env.gateway`
2. **Ensure Supabase session** is available in frontend
3. **Test WebSocket connection** with Supabase access_token
4. **Monitor Gateway logs** for ES256 verification success
5. **Remove custom JWT generation** if no longer needed

## Why This Architecture?

This follows the same pattern as **Discord Gateway** and **Slack RTM**:

- ✅ **No shared secrets** (uses public keys)
- ✅ **Key rotation** (Supabase manages keys)
- ✅ **Fail-fast** (rejects invalid tokens immediately)
- ✅ **Zero trust** (validates user in DB even with valid JWT)
- ✅ **Production-ready** (industry standard approach)
