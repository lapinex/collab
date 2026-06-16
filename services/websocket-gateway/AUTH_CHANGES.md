# JWT Authentication Notes

## Summary

The gateway uses application JWT access tokens signed with HS256.

- Verification logic: `services/websocket-gateway/src/auth/jwks.ts`
- Required secret: `WS_JWT_SECRET` (fallback to `JWT_SECRET`)
- Required claims: `sub` (+ issuer/audience validation)

## Required env

```env
WS_JWT_SECRET=change_me_super_long_random_string
AUTH_BEARER_ISSUER=collab-api
AUTH_BEARER_AUDIENCE=collab-web
```

## Security behavior

- Access-token only (`type=access` when present)
- User must exist in DB after token verification
- Auth errors are returned without leaking token contents

