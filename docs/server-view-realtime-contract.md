# Server View Realtime Contract

**См. также:** [server-view-cache.md](architecture/server-view-cache.md) — после 0.17.1 используется slice-кэш (`sv:meta`, `sv:channels`, и т.д.), не `['serverView', serverId]`.

## 1. Introduction

Кэш ServerView обновляется **только** через pure patchers по realtime-событиям. Slice keys: `['sv:meta', serverId]`, `['sv:channels', serverId]`, и т.д. (см. server-view-cache.md). There is no fallback "refetch on event" — the patcher must be able to apply the event payload and produce a valid view.

This document is the **contract** between:

- **Server View Builders** (`lib/view-builders/server/*`) — define the canonical shape and sort order of view data.
- **Realtime Gateway** — must emit events whose payloads are **view-ready**, not DB-ready.
- **View Patchers** (`lib/view-patchers/serverView.patcher.ts`) — apply events blindly; they do not fetch, infer, or fix missing data.

If a realtime event cannot carry the minimal required payload, the gateway **must not** emit a patch-style event; the client must invalidate the relevant slice(s), e.g. `invalidateQueries(['sv:channels', serverId])`.

---

## 2. DB Events vs View Events

| DB event | View event | Difference |
|----------|------------|------------|
| "row inserted in `channels`" | `channel_created` | View event must carry the **full Channel** object as returned by the view builder (same shape as GET view API). Client cannot "load the rest" — patcher replaces/inserts this object and re-sorts. |
| "row updated" | `channel_updated` / `role_updated` / etc. | Payload is the **entire updated entity** in view shape. IDs alone or deltas are not enough for add/update; delete events may carry only `id`. |
| "row deleted" | `channel_deleted` / `emoji_deleted` / `webhook_deleted` | Payload must at least include `id` so the patcher can remove the correct item. |

Rules:

- Realtime must **not** send raw DB rows (e.g. with DB-only columns or different naming). It must send the same shape the view API returns.
- The client **must not** "figure out the rest" (e.g. fetch channel by id to complete a partial payload). Either the event is complete and view-ready, or the client must invalidate.
- **All `*_updated` events are full snapshot replacement events, not partial updates.** The payload is treated as "replace this entity in cache with this exact object". Any missing field will be permanently erased from client cache. The gateway must never send deltas or partial payloads for `channel_updated`, `role_updated`, or `member_updated`.

---

## 3. Reference Shapes (from builders and types)

Inferred from `lib/view-builders/server/*`, `lib/view-patchers/serverView.patcher.ts`, `hooks/useServerViewQuery.ts`, and `types/server.ts`. **No invented fields.**

### ServerViewData

- `server`, `roles`, `channels`, `members`, `emojis`, `stickers`, `webhooks`, `currentUserPermissions?`, `error?`

### Channel (view shape)

- `id`, `serverId`, `name`, `type`, `position`, `parentId`, `topic`, `slowmode`, `createdAt`, `updatedAt`
- `type`: `'text' | 'voice' | 'category' | 'announcements' | 'forum'`
- Dates: ISO 8601 strings (JSON) or numeric ms; patcher compares via `new Date(x).getTime()`.

### Role (view shape)

- `id`, `serverId`, `name`, `color`, `position`, `permissions`, `createdAt`, `updatedAt`
- `permissions`: **number** (view API / builders serialize bigint to number).

### MembersPreviewItem → ServerViewMember (view shape)

- `id`, `userId`, `name`, `nickname`, `roles`, `avatar`, `isOwner`
- `roles`: `Array<{ id, name, color, position }>` — sorted by `position` desc per builder.
- Patcher maps `avatar` → `avatarUrl`, sets `email: ''` for cache.

### ServerEmoji (view shape)

- `id`, `serverId`, `name`, `url`, `createdBy`, `createdAt`

### ServerSticker (view shape)

- `id`, `serverId`, `name`, `url`, `createdBy`, `createdAt`

### Webhook (view shape)

- `id`, `serverId`, `channelId`, `name`, `url`, `createdBy`, `createdAt`, `updatedAt`

---

## 4. Sort Logic (patcher dependencies)

| Collection | Sort | Fields used |
|------------|------|-------------|
| channels | `sortChannels` | `position` (asc), then `createdAt` (asc) |
| roles | `sortRoles` | `position` (desc) |
| members | `sortMembers` | `view.server.ownerId` (owner first), then `Math.max(roles[].position)` (desc) |
| emojis | `sortEmojis` | `name` (localeCompare asc) |
| stickers | `sortStickers` | `name` (localeCompare asc) |
| webhooks | `sortWebhooks` | `name` (localeCompare asc) |

If the payload is missing a field used in sort, the item can be placed in the wrong order and the view is inconsistent with a full rebuild.

---

## 5. Events and Required Payloads

---

### Channels

#### channel_created

1. **Why it affects ServerView**  
   A new channel was added to the server; `ServerViewData.channels` must include it in the correct sort order.

2. **Patcher**  
   `patchChannels(view, channel, 'add')`.

3. **Sort logic**  
   `sortChannels`: uses `position`, then `createdAt`. Both must be present and comparable.

4. **Minimal REQUIRED payload**  
   Full **Channel** object (view shape): `id`, `serverId`, `name`, `type`, `position`, `parentId`, `topic`, `slowmode`, `createdAt`, `updatedAt`.

5. **Why missing fields corrupt the view**  
   Missing `position` or `createdAt`: sort is undefined or wrong. Missing `id`: patcher cannot deduplicate. Missing `name`/`type`/etc.: UI or other consumers may break or show invalid state.

6. **Example — correct payload (JSON)**

```json
{
  "action": "channel_created",
  "channel": {
    "id": "ch_1",
    "serverId": "srv_1",
    "name": "general",
    "type": "text",
    "position": 0,
    "parentId": null,
    "topic": null,
    "slowmode": 0,
    "createdAt": "2025-01-15T10:00:00.000Z",
    "updatedAt": "2025-01-15T10:00:00.000Z"
  }
}
```

7. **Example — insufficient payload and why it breaks**

```json
{
  "action": "channel_created",
  "channel": {
    "id": "ch_1",
    "name": "general"
  }
}
```

**Why it breaks:** No `position` or `createdAt` → `sortChannels` cannot order the new channel; result is non-deterministic or wrong order. Patcher does not fetch; view stays inconsistent. **Such a case REQUIRES invalidateQueries.**

---

#### channel_updated

1. **Why it affects ServerView**  
   An existing channel was changed (name, type, position, etc.); the cached channel must be replaced by the new view row.

2. **Patcher**  
   `patchChannels(view, channel, 'update')`.

3. **Sort logic**  
   Same as `channel_created`: `position`, `createdAt` used by `sortChannels` after replace.

4. **Minimal REQUIRED payload**  
   Full **Channel** object (view shape). Same as `channel_created`.

5. **Why missing fields corrupt the view**  
   Partial update is not applied by the patcher; it does a full replace by `id`. If payload is partial, the cached channel gets overwritten with incomplete data (e.g. missing `position` → wrong order).

6. **Example — correct payload (JSON)**  
   Same structure as `channel_created`; `action`: `"channel_updated"`, and `channel` is the full updated Channel.

7. **Example — insufficient payload**

```json
{
  "action": "channel_updated",
  "channel": {
    "id": "ch_1",
    "position": 2
  }
}
```

**Why it breaks:** Patcher replaces the channel with this object. Other fields (`name`, `type`, `createdAt`, etc.) are missing in cache → wrong sort, broken UI. **REQUIRES invalidateQueries** if gateway cannot send full Channel.

---

#### channel_deleted

1. **Why it affects ServerView**  
   The channel was removed; it must disappear from `ServerViewData.channels`.

2. **Patcher**  
   `patchChannels(view, channel, 'remove')` — filters by `c.id !== channel.id`. Only `channel.id` is read.

3. **Sort logic**  
   None for remove; order of remaining items is unchanged.

4. **Minimal REQUIRED payload**  
   Object with **`id`** (string). No other Channel fields required.

5. **Why missing `id` corrupts the view**  
   Without `id`, the patcher cannot identify which channel to remove; no-op or wrong removal.

6. **Example — correct payload (JSON)**

```json
{
  "action": "channel_deleted",
  "channel": {
    "id": "ch_1"
  }
}
```

7. **Example — insufficient payload**

```json
{
  "action": "channel_deleted",
  "channel": {}
}
```

**Why it breaks:** `channel.id` is undefined; filter never matches; channel stays in cache. **REQUIRES invalidateQueries** if gateway cannot send at least `{ id }`.

---

### Roles

#### role_updated

1. **Why it affects ServerView**  
   Role name, color, position, or permissions changed; cached `ServerViewData.roles` must hold the new view row and correct order.

2. **Patcher**  
   `patchRoles(view, role)` — replace by `role.id`, then `sortRoles` by `position` desc.

3. **Sort logic**  
   `sortRoles`: uses `position` (desc). Role must have `position` for correct order.

4. **Minimal REQUIRED payload**  
   Full **Role** object (view shape): `id`, `serverId`, `name`, `color`, `position`, `permissions` (number), `createdAt`, `updatedAt`.

5. **Why missing fields corrupt the view**  
   Missing `position`: wrong order. Missing `permissions`: permission checks wrong. Patcher does full replace by id; partial payload overwrites cache with incomplete role.

6. **Example — correct payload (JSON)**

```json
{
  "action": "role_updated",
  "role": {
    "id": "role_1",
    "serverId": "srv_1",
    "name": "Moderator",
    "color": "#5865F2",
    "position": 10,
    "permissions": 8589934591,
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-15T12:00:00.000Z"
  }
}
```

7. **Example — insufficient payload**

```json
{
  "action": "role_updated",
  "role": {
    "id": "role_1",
    "name": "Moderator"
  }
}
```

**Why it breaks:** After replace, cached role has no `position` → wrong order; no `permissions` → wrong permissions. **REQUIRES invalidateQueries** if full Role cannot be sent.

---

### Members

#### member_updated

1. **Why it affects ServerView**  
   Member profile or roles changed (nickname, avatar, role list); `ServerViewData.members` must show the new state and correct order (owner first, then by top role position).

2. **Patcher**  
   `patchMember(view, member)` — maps to `ServerViewMember` (`avatar` → `avatarUrl`, `email: ''`), then add/update by `member.userId`, then `sortMembers(ownerId, roles[].position)`.

3. **Sort logic**  
   `sortMembers`: owner first (by `view.server.ownerId`), then by `Math.max(roles[].position)` desc. So `roles` must be present and each role must have `position`; `isOwner` must be correct for display.

   **Dependency on roles:** This event assumes that **roles in cache already reflect the latest role positions**. If a member's roles changed and `role_updated` was also emitted (e.g. role position changed), but the client processed `member_updated` before `role_updated`, the member will be sorted using stale role positions. In role position reorder scenarios, **invalidate is mandatory** — do not rely on patch order.

4. **Minimal REQUIRED payload**  
   Full **MembersPreviewItem** (view shape): `id`, `userId`, `name`, `nickname`, `roles` (array of `{ id, name, color, position }`), `avatar`, `isOwner`. Roles array should be sorted by `position` desc (per builder) for consistency.

5. **Why missing fields corrupt the view**  
   Missing `roles` or role `position`: member sort order wrong. Missing `userId`/`id`: patcher cannot match existing member. Missing `avatar`/`name`: wrong display. Patcher does not fetch; it only applies this object.

6. **Example — correct payload (JSON)**

```json
{
  "action": "member_updated",
  "member": {
    "id": "usr_1",
    "userId": "usr_1",
    "name": "Alice",
    "nickname": "al",
    "roles": [
      { "id": "role_1", "name": "Moderator", "color": "#5865F2", "position": 10 }
    ],
    "avatar": "https://example.com/avatar.png",
    "isOwner": false
  }
}
```

7. **Example — insufficient payload**

```json
{
  "action": "member_updated",
  "member": {
    "userId": "usr_1",
    "name": "Alice"
  }
}
```

**Why it breaks:** No `roles` → sort uses max of empty list (0); member can be misplaced. No `avatar`/`nickname`/`isOwner` → wrong cache shape and display. **REQUIRES invalidateQueries** if full MembersPreviewItem cannot be sent.

---

### Emojis

#### emoji_created

1. **Why it affects ServerView**  
   A new server emoji was added; `ServerViewData.emojis` must include it, sorted by `name`.

2. **Patcher**  
   `patchEmojis(view, emoji, 'add')` → `sortEmojis` by `name`.

3. **Sort logic**  
   `sortEmojis`: uses `name` (localeCompare). Emoji must have `name` and `id`.

4. **Minimal REQUIRED payload**  
   Full **ServerEmoji** (view shape): `id`, `serverId`, `name`, `url`, `createdBy`, `createdAt`.

5. **Why missing fields corrupt the view**  
   Missing `name`: sort undefined or wrong. Missing `id`: duplicate risk. Missing `url`: UI cannot display. Patcher does not fetch.

6. **Example — correct payload (JSON)**

```json
{
  "action": "emoji_created",
  "emoji": {
    "id": "emoji_1",
    "serverId": "srv_1",
    "name": "custom_hello",
    "url": "https://cdn.example.com/emoji/hello.png",
    "createdBy": "usr_1",
    "createdAt": "2025-01-15T10:00:00.000Z"
  }
}
```

7. **Example — insufficient payload**

```json
{
  "action": "emoji_created",
  "emoji": {
    "id": "emoji_1"
  }
}
```

**Why it breaks:** No `name` → sort broken; no `url` → broken display. **REQUIRES invalidateQueries** if full ServerEmoji cannot be sent.

---

#### emoji_deleted

1. **Why it affects ServerView**  
   The emoji was removed; it must be removed from `ServerViewData.emojis`.

2. **Patcher**  
   `patchEmojis(view, emoji, 'remove')` — filters by `e.id !== emoji.id`. Only `emoji.id` is read.

3. **Sort logic**  
   None for remove.

4. **Minimal REQUIRED payload**  
   Object with **`id`** (string). No other fields required.

5. **Why missing `id` corrupts the view**  
   Without `id`, patcher cannot remove the correct emoji.

6. **Example — correct payload (JSON)**

```json
{
  "action": "emoji_deleted",
  "emoji": {
    "id": "emoji_1"
  }
}
```

7. **Example — insufficient payload**

```json
{
  "action": "emoji_deleted",
  "emoji": {}
}
```

**Why it breaks:** `emoji.id` undefined → filter never matches → emoji remains in cache. **REQUIRES invalidateQueries** if gateway cannot send `{ id }`.

---

### Webhooks

#### webhook_deleted

1. **Why it affects ServerView**  
   The webhook was removed; it must be removed from `ServerViewData.webhooks`.

2. **Patcher**  
   `patchWebhooks(view, webhook, 'remove')` — filters by `w.id !== webhook.id`. Only `webhook.id` is read.

3. **Sort logic**  
   None for remove.

4. **Minimal REQUIRED payload**  
   Object with **`id`** (string). No other fields required.

5. **Why missing `id` corrupts the view**  
   Without `id`, patcher cannot remove the correct webhook.

6. **Example — correct payload (JSON)**

```json
{
  "action": "webhook_deleted",
  "webhook": {
    "id": "wh_1"
  }
}
```

7. **Example — insufficient payload**

```json
{
  "action": "webhook_deleted",
  "webhook": {}
}
```

**Why it breaks:** `webhook.id` undefined → no removal → stale webhook in cache. **REQUIRES invalidateQueries** if gateway cannot send `{ id }`.

---

## 6. Non-patchable parts of ServerViewData

The following fields of `ServerViewData` are **intentionally non-patchable**. There are no realtime events in this contract that update them. Any change to these parts **always requires** `invalidateQueries(['serverView', serverId])`.

| Part | Reason |
|------|--------|
| **`server`** | Server metadata (name, icon, description, ownerId, verification level, system/rules/default channels, voice region, moderation settings, community settings, etc.) has no dedicated patch event. The patcher layer only updates `channels`, `roles`, `members`, `emojis`, `stickers`, `webhooks`. Changing server name, icon, or settings → invalidate. |
| **`currentUserPermissions`** | Computed from server + roles + overwrites; not a single entity. No event carries "new permissions for current user". Permission or role changes that affect the current user → invalidate. |

So **ServerView is not fully patch-compatible**: only the list-like parts (channels, roles, members, emojis, stickers, webhooks) are updated by events; the rest of the view is refreshed only by full refetch.

---

## 7. Cases Where invalidateQueries Is Still Mandatory

The client **must** call `invalidateQueries({ queryKey: ['serverView', serverId] })` (or equivalent) in these situations:

1. **Role position reorder**  
   Multiple roles change position; a single `role_updated` only updates one role. The patcher does not reorder the rest by a "reorder" event. Full view refetch is the safe way to get consistent order.

2. **Bulk / mass changes**  
   Many channels, roles, or members change at once (e.g. server import, mass role assign). Emitting one event per entity may be out of order or too heavy; refetch is simpler and correct.

3. **Event payload cannot meet the contract**  
   If the realtime gateway cannot emit view-ready payloads (full Channel, full Role, full MembersPreviewItem, full ServerEmoji as above), it must **not** send a patch event. The client should treat that as "unknown server view change" and invalidate.

4. **Unknown or new event types**  
   If the client receives an event type it does not handle (e.g. new action), it must not guess; it should invalidate for that server.

5. **Fallback / safety**  
   On reconnect, or after prolonged disconnect, or on explicit user action (e.g. "Refresh"), invalidate is allowed and recommended to re-sync with the server.

6. **Permission or server metadata change**  
   `server` and `currentUserPermissions` are non-patchable (see §6). Any change to them requires invalidate.

---

**Summary for backend:** Realtime events are **view contracts**. Emit only when the payload is complete and matches the shapes above. Otherwise, do not emit a patch event; the client will rely on invalidate to stay correct.
