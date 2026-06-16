# Changelog

## [Unreleased]

### Security

- **Password reset (confirm)**  
  `POST /api/auth/password/confirm-reset` now **requires a valid `token`** in the body (the value returned in the reset email/link). The token is validated against Redis (`pwdreset:${token}`); without it, or if email does not match the token’s user, the request is rejected. **Client must send `token`** in addition to `email` and `newPassword`.
- **Voice:** Join and participants endpoints enforce channel access (VIEW_CHANNEL and CONNECT for server channels; DM membership for DM channels). Signaling key endpoint allows read/delete only if the caller is the source or target of the key.
- **DM calls:** Call endpoints verify that the caller is a participant of the DM; `fromUserId` is always set to the authenticated user.
- **Role assignment:** Assigning/removing roles validates that the role belongs to the server and that the target user is a member of the server.
- **Reactions:** Add/remove reaction endpoints now enforce channel access (VIEW_CHANNEL, READ_MESSAGE_HISTORY; ADD_REACTIONS for adding).
- **Server view:** Channels are filtered by VIEW_CHANNEL; webhook `url` is returned only for users with MANAGE_SERVER.
- **Channel view:** `currentUserPermissions` are now channel-level (with overwrites), not server-level only.

### Breaking

- **Channels list filtered by VIEW_CHANNEL**  
  `GET /api/servers/:serverId/channels` now returns only channels where the user has the `VIEW_CHANNEL` permission (server role + channel overwrites). Channels without view access are no longer included. In development, the client logs how many channels were filtered (e.g. `[Channels] Filtered by VIEW_CHANNEL: N channel(s) hidden due to permissions`).

- **Channels list: pagination and performance**  
  - Pagination is based on the raw channel list (before permission filter). Each response returns **all** visible (VIEW_CHANNEL) channels from the current raw batch (up to `limit` raw rows), so no channel is skipped when many are hidden. `hasMore` and `nextCursor` allow fetching the next raw batch.
  - The list endpoint is capped at **50 channels per request** (`limit` is clamped to 50) to keep permission resolution fast. Use `cursor` to page through larger servers.

### Required migration

- **Run migration 006 for existing servers**  
  To ensure backward compatibility and correct permissions for existing members, run:
  ```bash
  psql $DATABASE_URL -f migrations/006_backfill_everyone_role.sql
  ```
  This script is idempotent (safe to run multiple times). It:
  0. **Deduplicates `@everyone` roles:** for any server with multiple `@everyone` roles, keeps one by semantics (prefer default member permissions, then lowest `position`, then smallest `id`), reassigns `user_roles` to it, and deletes the others. Then creates a unique partial index so only one `@everyone` per server can exist.
  1. Creates an `@everyone` role for each server that does not have one (with safe default member permissions).
  2. Assigns the `@everyone` role to every current member (owner + anyone in `user_roles`) who does not already have it.

Without this migration, members on servers created before the permission changes may have no base role and lack expected permissions.

**If you see `403 Forbidden` on `GET /api/messages`** (e.g. in the browser console): the API now requires the user to have **VIEW_CHANNEL** and **READ_MESSAGE_HISTORY** for that channel. If migration 006 has not been run, existing members may have no `@everyone` role and thus zero channel permissions → 403. **Fix:** run migration 006, then ensure the user has the `@everyone` role on the server (or a role that grants these permissions). The API response body includes `code: "CHANNEL_ACCESS_DENIED"` or `"CHANNEL_NOT_FOUND"` to help distinguish cases.

- **Owner permissions fix:** Server owners (`servers.owner_id`) are now granted **READ_MESSAGE_HISTORY** in code (previously only VIEW_CHANNEL and SEND_MESSAGES were in `ownerPermissions()`). This fixes 403 Forbidden for owners when loading channel messages; no DB change required.

### Server settings and API alignment

- **Single settings entry point:** The main app now opens the **new** server settings page (`/app/servers/[serverId]/settings`) when clicking the server settings (gear) button. The old `ServerSettingsModal` is no longer used for that flow; roles and channels in the new page load from the server view API.
- **PATCH server:** Overview, Security, and Community tabs now call `PATCH /api/servers/:serverId` (no `/settings` path). The API accepts and persists `name`, `description`, `iconUrl`, `verificationLevel`, `voiceRegion`, `mediaScanLevel`, `linkFilterEnabled`, `badWordsFilterLevel`, `customBadWords`, `isCommunity`, `rulesChannelId`, `announcementsChannelId`.
- **Delete server:** Danger Zone uses `DELETE /api/servers/:serverId` instead of `POST .../delete`.
- **Channel edit:** Channel settings use `PATCH /api/channels/:channelId` instead of `PATCH /api/servers/:serverId/channels/:channelId`.
- **Channel permissions:** New API routes: `POST /api/channels/:channelId/permissions` (create/update overwrite by `roleId` or `userId`, `allow`, `deny`) and `DELETE /api/channels/:channelId/permissions/:overwriteId`. Requires MANAGE_CHANNELS on the server.
- **Roles reorder:** New API route `POST /api/servers/:serverId/roles/reorder` (body: `{ roleIds: string[] }`). Requires MANAGE_ROLES.
- **Webhook delete:** New API route `DELETE /api/servers/:serverId/webhooks/:webhookId`. Requires MANAGE_SERVER.
- **UI:** `READ_MESSAGE_HISTORY` is marked as `implemented: true` in permission constants (backend already enforced it). A comment in `types/permissions.ts` notes that UI/role editor should use only permission bits 0–30 to avoid 32-bit overflow.
