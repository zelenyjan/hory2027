# Ski Trip Hub — Software Design Document

**Status:** Draft v1 · **Date:** 2026-08-01 · **Owner:** Green · **Production:** https://hory2027.baby

---

## 1. Overview

Ski Trip Hub is a small, private web application for planning a group ski trip, replacing an unstructured WhatsApp group. It provides three core features: a real-time group chat, a standalone voting/polls area, and a shared accommodation shortlist where members paste Booking.com/Airbnb links with a mandatory total price, rate them, and discuss them in per-accommodation comment threads.

The application is invite-only. There is no public signup and no public content. The admin (Green) creates members by name; each member receives a unique invite link that works as a permanent passwordless login. Members may optionally set a password and use a classic login form instead.

### 1.1 Goals

The app must be trivially cheap to run (Cloudflare free/paid-lite tier), require zero maintenance between trips, feel instant for a group of roughly 5–20 people, and keep all trip data in one place instead of scattered across a chat scroll.

### 1.2 Non-goals (v1)

No email delivery, no file/photo uploads (candidate for v2 via R2), no multi-trip support (one trip = one deployment; multi-trip is a v2 candidate), no automated scraping of Booking/Airbnb metadata (see §6.3), no native mobile app — the SPA is a PWA with Web Push instead.

---

## 2. Tech stack & Cloudflare mapping

| Concern           | Choice                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| Backend framework | Hono on Cloudflare Workers (TypeScript)                                                              |
| Frontend          | React 19 + Vite + TypeScript, Tailwind CSS v4, TanStack Query, react-router                          |
| Hosting/runtime   | Single Cloudflare Worker; SPA served via Workers Static Assets from the same Worker                  |
| Database          | Cloudflare D1 (SQLite), migrations via `wrangler d1 migrations`                                      |
| Real-time         | One Durable Object (`TripRoom`) using the WebSocket Hibernation API                                  |
| Secrets           | Worker secrets: `SESSION_SECRET`, `ADMIN_INITIAL_PASSWORD`                                           |
| Tooling           | wrangler, pnpm workspace (`apps/web`, `apps/api` or a single app with `/src/server` + `/src/client`) |
| CI/CD             | `wrangler deploy` locally or via GitHub Actions (optional)                                           |

Everything runs in one Worker deployment: same origin for API (`/api/*`), WebSocket (`/api/ws`), and static SPA (fallback route). No CORS, one `wrangler.jsonc`.

### 2.1 Repository layout

```
ski-trip-hub/
├─ src/
│  ├─ server/          # Hono app, routes, middleware, DO class
│  │  ├─ index.ts      # Worker entry: Hono app + static assets fallback
│  │  ├─ routes/       # auth, chat, polls, accommodations, admin
│  │  ├─ do/TripRoom.ts
│  │  ├─ db/           # query helpers, types
│  │  └─ auth/         # sessions, password hashing, invite tokens
│  ├─ client/          # React SPA
│  └─ shared/          # zod schemas + TS types shared client/server
├─ migrations/         # D1 SQL migrations
└─ wrangler.jsonc
```

---

## 3. Roles & permissions

Two roles: `admin` and `member`. The admin is also a regular participant.

| Action                                                           | Member | Admin |
| ---------------------------------------------------------------- | ------ | ----- |
| Read everything, chat, react, vote, comment                      | ✔      | ✔     |
| Edit/delete **own** chat message                                 | ✔      | ✔     |
| Delete **any** chat message                                      | —      | ✔     |
| Create poll                                                      | ✔      | ✔     |
| Close/delete **own** poll                                        | ✔      | ✔     |
| Delete **any** poll                                              | —      | ✔     |
| Add accommodation                                                | ✔      | ✔     |
| Delete **own** accommodation                                     | ✔      | ✔     |
| Delete **any** accommodation                                     | —      | ✔     |
| Delete own comment                                               | ✔      | ✔     |
| Delete any comment                                               | —      | ✔     |
| Create/revoke/regenerate invites, rename users, deactivate users | —      | ✔     |

Deleting an accommodation cascades its ratings and comments. Deleting a poll cascades options and votes.

---

## 4. Authentication & sessions

### 4.1 Admin bootstrap

The admin account is seeded by the initial D1 migration (`role='admin'`, no password hash). On the login screen, the admin signs in with username `admin` and the value of the `ADMIN_INITIAL_PASSWORD` Worker secret; the first successful login forces a "set your real password" step, after which the secret value is no longer accepted (guarded by a `password_hash IS NOT NULL` check). This avoids any public "setup" endpoint.

### 4.2 Invite links (passwordless login)

When the admin creates a user with a display name, the server generates a 32-byte random token, stores only its SHA-256 hash in `users.invite_token_hash`, and returns the link once: `https://<host>/join/<token>`. Visiting the link looks up the hash, verifies the user is active and the token not revoked, creates a session, and redirects into the app. The link works indefinitely and repeatedly — it _is_ the credential — unless the admin revokes or regenerates it (regeneration invalidates the old link and produces a new one, for the inevitable "I lost the link" case).

### 4.3 Optional password

Any member can set a password in their profile (min. 10 chars). After that, they can also log in with name + password on `/login`. The invite link keeps working unless the user or admin disables it. Password hashing uses PBKDF2-SHA256 (WebCrypto, 100k iterations — the maximum Workers allows — per-user salt) — the pragmatic standard on Workers, where bcrypt/argon2 aren't natively available.

### 4.4 Sessions

Server-side sessions stored in D1 (`sessions` table: random 32-byte id hashed, user id, created/expires, last_seen). The client holds an `HttpOnly; Secure; SameSite=Lax` cookie. Lifetime 90 days, sliding. Server-side storage makes revocation trivial (deactivate user → delete sessions). A Hono middleware resolves the session on every `/api/*` request and attaches `ctx.user`.

### 4.5 Privacy hardening

All routes except `/login`, `/join/:token`, and static assets require a session. Responses include `X-Robots-Tag: noindex` and the SPA ships a restrictive `robots.txt`. Invite tokens never appear in logs (only hashes touch the DB).

---

## 5. Data model (D1)

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin','member')) DEFAULT 'member',
  invite_token_hash TEXT UNIQUE,           -- NULL for admin
  invite_revoked INTEGER NOT NULL DEFAULT 0,
  password_hash TEXT,                      -- NULL until user sets one
  password_salt TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  quoted_message_id INTEGER REFERENCES messages(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  edited_at TEXT,
  deleted_at TEXT                          -- tombstone: body cleared on delete
);

CREATE TABLE reactions (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,                     -- e.g. 👍 ❤️ 😂 😮 😢 🙏 (WhatsApp set)
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE polls (
  id INTEGER PRIMARY KEY,
  creator_id INTEGER NOT NULL REFERENCES users(id),
  question TEXT NOT NULL,
  multi_choice INTEGER NOT NULL DEFAULT 0,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE poll_options (
  id INTEGER PRIMARY KEY,
  poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  position INTEGER NOT NULL
);

CREATE TABLE poll_votes (
  poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  option_id INTEGER NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (option_id, user_id)
  -- single-choice enforced in application logic: replace existing vote in poll
);

CREATE TABLE accommodations (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  url TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('booking','airbnb','other')),
  location TEXT NOT NULL COLLATE NOCASE,   -- free text, autocomplete-assisted (e.g. "Sölden")
  total_price_czk INTEGER NOT NULL,        -- whole CZK, required
  comment TEXT,                            -- optional (dates, capacity, distance to lift…)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_accommodations_location ON accommodations(location);

CREATE TABLE accommodation_ratings (
  accommodation_id INTEGER NOT NULL REFERENCES accommodations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value INTEGER NOT NULL CHECK (value IN (-1, 1)),   -- thumbs down / up
  PRIMARY KEY (accommodation_id, user_id)
);

CREATE TABLE accommodation_comments (
  id INTEGER PRIMARY KEY,
  accommodation_id INTEGER NOT NULL REFERENCES accommodations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
```

Provider is derived server-side from the URL hostname (`booking.com` → `booking`, `airbnb.*` → `airbnb`, anything else → `other`; arbitrary URLs are allowed but the two named providers get their logo badge in the UI).

---

## 6. Features

### 6.1 Chat

Single group channel. Messages support plain text with auto-linkified URLs. WhatsApp-style interactions: emoji reactions (fixed picker of 6 + free emoji), edit own message (shows an "edited" marker, no edit history in v1), delete (tombstone — body is blanked in DB and UI shows "message deleted"), and quote/reply (message stores `quoted_message_id`; UI renders a snippet of the quoted message above the reply and scrolls to it on tap). Pagination: newest 50 on load, infinite scroll upward via cursor (`created_at`, `id`).

### 6.2 Polls (standalone)

A dedicated "Voting" section, deliberately outside the chat. Any member creates a poll with a question, 2–10 options, and a single/multi-choice flag. Votes are **visible with names** (design decision: small friend group, transparency beats anonymity — easy to flip later by dropping user names from the results payload). Voters can change their vote until the poll is closed. Creator or admin can close a poll (freezes voting, keeps results visible) or delete it.

### 6.3 Accommodations

The shortlist board. Adding an entry requires: **URL**, **total price in CZK**, and **location**; an optional free-text **comment** covers dates/capacity/distance-to-lift. The price is the whole point, so it's rendered prominently on the card.

**Location with autocomplete.** Location is free text backed by autocomplete over distinct locations already in the table (combobox: typing filters existing values, but any new value can be submitted). Values are trimmed and matched case-insensitively (`COLLATE NOCASE`) so "Sölden" and "sölden" collapse into one location for autocomplete and filtering. The board has a **location filter** — a dropdown/chip row of distinct locations with counts (e.g. "Sölden (4)"), plus "All".

**Provider icon.** The provider is derived from the URL hostname and each card shows the corresponding icon — Booking.com, Airbnb, or a generic link icon for anything else.

**No automated metadata scraping.** Booking.com and Airbnb actively block server-side fetching, so v1 does not attempt to fetch titles, photos, or prices from the link. The card is headed by the location and shows the provider icon (tapping it opens the URL), price in CZK, thumbs summary (e.g. 👍 6 · 👎 1, with names on tap), comment-thread count, the author's optional comment, and who added it. A best-effort Open Graph fetch can be layered on later behind a feature flag without changing the schema.

Each member rates thumbs up or down (one rating, changeable, tap again to remove). Each accommodation has its own comment thread (flat, chronological, same tombstone-delete rules as chat). The entry's author or the admin can delete the entry, cascading ratings and comments; the UI confirms with the comment count ("This will also delete 12 comments").

List sorting: default by net score (👍 − 👎) descending, with toggles for price and newest. Sorting composes with the location filter (filter first, then sort).

### 6.4 Admin area

A `/admin` section visible only to the admin: user list with status (has password? link revoked? last seen), "add user" (name → shows the invite link once with a copy button), regenerate/revoke link, rename, deactivate. Deactivation kills sessions and both login paths but preserves the user's messages and content under their name.

---

## 7. API design

All endpoints under `/api`, JSON, session-cookie auth, zod-validated bodies (schemas shared with the client from `src/shared`).

```
POST   /api/auth/login                { name, password }
GET    /api/auth/join/:token          → sets session, 302 to /
POST   /api/auth/logout
GET    /api/auth/me
POST   /api/auth/password             { current?, new }   # set/change own password

GET    /api/messages?cursor=…&limit=50
POST   /api/messages                  { body, quotedMessageId? }
PATCH  /api/messages/:id              { body }            # author only
DELETE /api/messages/:id                                  # author or admin
PUT    /api/messages/:id/reactions    { emoji }           # toggle

GET    /api/polls
POST   /api/polls                     { question, options[], multiChoice }
POST   /api/polls/:id/votes           { optionIds[] }     # replaces own vote(s)
POST   /api/polls/:id/close                               # creator or admin
DELETE /api/polls/:id                                     # creator or admin

GET    /api/accommodations?location=…                     # optional filter
GET    /api/accommodations/locations                      # distinct locations + counts (autocomplete + filter UI)
POST   /api/accommodations            { url, priceCzk, location, comment? }
DELETE /api/accommodations/:id                            # author or admin
PUT    /api/accommodations/:id/rating { value: 1 | -1 | 0 }   # 0 = remove
GET    /api/accommodations/:id/comments
POST   /api/accommodations/:id/comments { body }
DELETE /api/comments/:id                                  # author or admin

# admin only
GET    /api/admin/users
POST   /api/admin/users               { name } → { inviteUrl }
POST   /api/admin/users/:id/invite    # regenerate → { inviteUrl }
DELETE /api/admin/users/:id/invite    # revoke link
PATCH  /api/admin/users/:id           { name?, active? }

GET    /api/ws                        # WebSocket upgrade → TripRoom DO
```

Mutation handlers follow one pattern: authorize → write to D1 → notify the DO → return the created/updated entity.

---

## 8. Real-time design (Durable Object)

A single `TripRoom` DO instance (fixed name `"trip"`) holds all live WebSocket connections using the **Hibernation API**, so the DO is evicted from memory between messages and costs nothing while the group sleeps.

D1 remains the single source of truth; the DO stores no domain data. Flow:

1. Client performs a mutation via the REST API (Worker).
2. Worker writes to D1.
3. Worker calls the DO stub (`room.broadcast(event)`) via RPC.
4. DO fans out the event to all hibernatable WebSockets.
5. Clients apply the event to their TanStack Query caches (`setQueryData` for chat; targeted `invalidateQueries` for polls/accommodations).

Event envelope:

```ts
type Event =
  | { type: 'message.created' | 'message.updated' | 'message.deleted'; payload: Message }
  | { type: 'reaction.toggled'; payload: { messageId; userId; emoji; added } }
  | { type: 'poll.created' | 'poll.closed' | 'poll.deleted'; payload: { pollId } }
  | { type: 'poll.voted'; payload: { pollId } }
  | { type: 'accommodation.created' | 'accommodation.deleted'; payload: { id } }
  | { type: 'accommodation.rated'; payload: { id } }
  | { type: 'comment.created' | 'comment.deleted'; payload: { accommodationId } };
```

WebSocket auth: the `/api/ws` upgrade request passes normal session-cookie middleware before forwarding to the DO; the DO tags each socket with the user id (`serializeAttachment`). Clients reconnect with exponential backoff and refetch the newest page on reconnect to close any gap. Presence ("3 online") is a cheap add-on later — the DO already knows its socket count.

Chat send path note: v1 sends messages via REST (simpler, uniform). Moving sends onto the socket is a pure optimization, not an architectural change.

---

## 9. Frontend

SPA with four top-level views behind a bottom tab bar (mobile-first): **Chat**, **Voting**, **Places** (accommodations), **Admin** (admin only), plus a profile sheet (set password, logout).

State: TanStack Query for all server data; a thin WebSocket hook dispatches events into the query cache. Optimistic updates for reactions, votes, and ratings (instant feel), server-confirmed for message send/edit. Forms with zod resolvers reusing the shared schemas; the location field is a headless combobox fed by `/api/accommodations/locations`, and the Places view keeps its location filter + sort in the URL query string so filtered views are shareable in chat. Tailwind v4 for styling; dark mode by media query.

Routing: `/login`, `/join/:token`, `/` (chat), `/voting`, `/places`, `/places/:id`, `/admin`. Unauthenticated access to app routes redirects to `/login`.

---

## 10. Deployment & environments

`wrangler.jsonc` defines: the Worker entry, `assets` binding (SPA `dist/` with SPA fallback to `index.html`), D1 binding `DB`, DO binding `TRIP_ROOM` (+ DO migration tag), and secrets `SESSION_SECRET`, `ADMIN_INITIAL_PASSWORD`.

Local development: `wrangler dev` with local D1 + DO emulation; Vite dev server proxying `/api` to wrangler (or `@cloudflare/vite-plugin` for a unified dev command). Production: `wrangler d1 migrations apply --remote && wrangler deploy`. **Production domain: `hory2027.baby`**, attached as a Custom Domain on the Worker (`routes: [{ pattern: "hory2027.baby", custom_domain: true }]` in `wrangler.jsonc`) with the zone on Cloudflare DNS — TLS is automatic. Invite links therefore take the form `https://hory2027.baby/join/<token>`. One environment is enough for v1; a `preview` env can be added in `wrangler.jsonc` if desired.

Cost expectation: within Workers free tier for this group size; the Workers Paid plan ($5/mo) removes any DO duration concerns.

---

## 11. Security summary

- No public content; every API route and the SPA data layer require a valid session.
- Invite tokens: 256-bit random, stored hashed, revocable, regenerable, shown once.
- Passwords: PBKDF2-SHA256 via WebCrypto, per-user salt, constant-time compare.
- Cookies: `HttpOnly; Secure; SameSite=Lax`; state-changing routes are same-origin only (Hono CSRF middleware as belt-and-suspenders).
- Authorization enforced server-side per resource (ownership or admin), never trusted from the client.
- Input validation with zod on every body; message/comment length caps; basic per-session rate limit on writes (counter in the DO).
- `X-Robots-Tag: noindex`, `robots.txt` disallow all.

---

## 12. Decisions made (defaults — veto anytime)

1. Poll votes are public within the group (names visible).
2. Deleted messages/comments leave a tombstone; bodies are blanked in the DB.
3. Prices are whole CZK only (single-currency; convert mentally or in the comment if a listing is in EUR).
4. No accommodation title field — the location is the card heading and the URL/provider icon is the link; no scraping in v1.
5. Location is free text (not a fixed enum) with autocomplete over existing values; case-insensitive matching prevents duplicates like "Sölden"/"sölden".
6. One trip per deployment; no trip switcher.
7. Chat sends go over REST; WebSocket is receive-only fan-out in v1.
8. Single fixed reaction picker matching WhatsApp's six, plus free emoji entry.

## 13. v2 candidates

Photo uploads to R2 (chat + accommodation galleries), best-effort OG metadata fetch, presence indicator and typing dots, poll deadlines, multi-trip support with archives, export of the final decision (chosen accommodation + roster) as a summary page.
