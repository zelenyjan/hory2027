# Hory 2027 — Ski Trip Hub

A small, private trip-planning app for one group of friends: real-time group chat, standalone
polls, and a shared accommodation shortlist with prices, thumbs, and per-place comment threads.

Everything runs in a single Cloudflare Worker: the Hono API (`/api/*`), the WebSocket fan-out
(`/api/ws` → a `TripRoom` Durable Object), and the React SPA served from Workers Static Assets.
D1 is the only source of truth. The full design lives in [CLAUDE.md](./CLAUDE.md).

Production: **https://hory2027.baby**

## Stack

| Concern       | Choice                                                    |
| ------------- | --------------------------------------------------------- |
| Runtime       | Cloudflare Workers, one deployment                         |
| API           | Hono + zod (schemas shared with the client)                |
| Database      | Cloudflare D1 (SQLite), `wrangler d1 migrations`           |
| Real-time     | One Durable Object using the WebSocket Hibernation API     |
| Frontend      | React 19, Vite, TanStack Query, react-router, Tailwind v4  |
| Theming       | Snow (default) / Night / System, remembered per device      |
| Build/dev     | `@cloudflare/vite-plugin` (one command for client + Worker) |

## Layout

```
src/
├─ server/         Worker: Hono app, routes, auth, D1 queries, Durable Object
│  ├─ index.ts     entry — middleware, route wiring, SPA fallback
│  ├─ routes/      auth, messages, polls, accommodations, admin
│  ├─ auth/        PBKDF2 hashing, invite tokens, D1-backed sessions
│  ├─ db/          query helpers that map rows to shared types
│  └─ do/          TripRoom: broadcast + presence + rate limiting
├─ client/         React SPA (pages, components, query/WS hooks)
└─ shared/         zod schemas, DTO types, WebSocket event envelope
migrations/        D1 SQL migrations
```

## Local development

```bash
pnpm install
cp .dev.vars.example .dev.vars     # then edit the two secrets
pnpm db:migrate:local              # creates the local D1 file and inserts the admin row
pnpm dev                           # http://localhost:5173
pnpm seed                          # optional: demo users, messages, a poll and three places
```

Sign in with the admin name seeded by `migrations/0001_init.sql` (currently `green`) and the
`ADMIN_INITIAL_PASSWORD` from `.dev.vars`. The app immediately asks you
to choose a real password; after that the bootstrap value stops being accepted. Add the rest of the
group in the **Admin** tab — each person gets a one-time-displayed invite link that doubles as their
permanent passwordless login.

Useful scripts:

| Command               | What it does                                                 |
| --------------------- | ------------------------------------------------------------ |
| `pnpm dev`            | Vite dev server with a local Worker, D1 and DO                |
| `pnpm typecheck`      | Type-checks the client and the Worker separately              |
| `pnpm build`          | Builds `dist/client` and `dist/hory2027`                      |
| `pnpm preview`        | Serves the production build through the real Worker runtime   |
| `pnpm db:reset:local` | Throws away the local database and re-runs migrations (restart `pnpm dev` afterwards) |
| `pnpm seed`           | Fills a fresh local database with demo content                |
| `pnpm uicheck`        | Headless click-through of every view (needs a local Chrome)   |
| `pnpm cf-typegen`     | Regenerates `worker-configuration.d.ts` from wrangler config  |
| `pnpm format`         | Prettier, including Tailwind class sorting                    |

## First deploy

```bash
# 1. Create the database and paste the returned id into wrangler.jsonc
pnpm wrangler d1 create hory2027

# 2. Secrets
pnpm wrangler secret put SESSION_SECRET          # long random string
pnpm wrangler secret put ADMIN_INITIAL_PASSWORD  # used once, for the first admin login

# 3. Schema, then ship
pnpm db:migrate:remote
pnpm deploy
```

`wrangler.jsonc` attaches `hory2027.baby` as a Custom Domain, so the zone must be on Cloudflare DNS;
TLS is automatic. Invite links are then `https://hory2027.baby/join/<token>`.

Later deploys are just `pnpm deploy` (plus `pnpm db:migrate:remote` when a migration is added).

## Security notes

- Nothing is public: every API route and every SPA route requires a session.
- Invite tokens are 256-bit random values, stored only as SHA-256 hashes, revocable and regenerable.
- Passwords use PBKDF2-SHA256 (300k iterations, per-user salt) via WebCrypto, compared in constant time.
- Sessions live in D1 behind an `HttpOnly; Secure; SameSite=Lax` cookie, 90 days sliding, so
  deactivating a user instantly kills their access.
- Writes are same-origin only (Hono CSRF plus an explicit Origin check) and rate limited per user in
  the Durable Object; logins are rate limited per IP.
- `X-Robots-Tag: noindex` on API responses and static assets, plus a disallow-all `robots.txt`.
