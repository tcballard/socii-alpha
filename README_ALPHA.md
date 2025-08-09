# Socii – Alpha Readme (Functional Overview)

This document captures the current alpha architecture, API surface, flows, environment requirements, and constraints for the distributed Socii prototype. It is intentionally pragmatic and focused on what exists today so we can iterate fast while keeping shared context.

## High-level architecture

- Client (web): Next.js app in `web/`
  - Stateless auth using locally generated Ed25519 keys
  - Calls a single Relay edge function with signed requests
  - Demo UI is at `/demo` showcasing the core loop
- Relay (server): Supabase Edge Function in `supabase/functions/relay/`
  - Verifies request signatures (Ed25519)
  - Talks to Postgres via Supabase client and Storage for avatars
  - Exposes a simple set of routes (query param `?route=`)
- Database (Supabase/Postgres): schema in `supabase/sql/relay_schema.sql`
  - Queues, invites, profiles, contacts, status updates, events, albums, contact requests

## Identity, keys and signatures (client-side only)

- Keys are generated on-device (browser) and stored in `localStorage` (dev-friendly):
  - `socii_web_seed_hex` – 32-byte seed (hex)
  - `socii_web_pk_hex` – Ed25519 public key (hex) used as `uid_hash`
  - `socii_web_sk_hex` – Ed25519 secret key (hex)
- Recovery phrase: base32 export/import of the seed for deterministic identities.
- Each request includes headers (see `web/src/lib/relay.ts#withSig`):
  - `x-ts`: client timestamp in ms (string)
  - `x-pk`: hex public key (Ed25519)
  - `x-sig`: detached Ed25519 signature over `${x-ts}\n${bodyText}`
- Registration: client calls `relay.register({ ed25519, x25519, uidHash })`. For x25519 we derive a deterministic keypair from the same seed; today the server stores these in `users_public` for future E2E features.

Notes and constraints:
- There is currently no server-side timestamp skew enforcement. `x-ts` is validated only as part of the signature string. Replay risk is low in alpha but not eliminated. Add skew checks if needed.
- In `DEV_NOAUTH=1` mode on the server, signature checks are bypassed for fast local/dev work.

## Relay routes (server API)

Implemented in `supabase/functions/relay/index.ts`. All routes are selected via `?route=` and are JSON unless noted.

Auth and admin:
- `register` POST – store public keys (required once per identity)
- `invites_generate` POST – admin-only (requires `x-admin-token == ADMIN_TOKEN`)

Messaging queue (at-least-once, per-recipient ordering):
- `enqueue` POST – append JSON payload to a recipient queue; returns monotonic `n`
- `queue` GET – fetch items `n >= from` for recipient; returns `items` and `next`
- `ack` POST – delete items `n <= upto` for recipient; returns `deleted` count

Profiles and avatars:
- `profile_get` GET – current user profile and a `joined_at` (fallback to `users_public.updated_at`)
- `profile_update` POST – upsert display_name, avatar_url, bio, favorites_*
- `avatar_upload` PUT – raw body upload to public `avatars` bucket; returns public URL

Contacts and requests:
- `contacts_list` GET – directed list (owner → peer) with joined profile fields
- `contacts_search` GET – search within circle by nickname/display_name/uid
- `contacts_add` POST – upsert peer into contacts
- `contacts_remove` POST – remove peer from contacts
- `contact_request_send` POST – create a pending contact request (requester → recipient)
- `contact_requests_incoming` GET – list pending requests for current user
- `contact_request_accept` POST – mark accepted and upsert both directions in `contacts`
 - `contact_requests_outgoing` GET – list your pending outgoing requests
 - `contact_request_cancel` POST – cancel your pending outgoing request by id

Global profiles search:
- `profiles_search` GET – search by `display_name` (ILIKE, limit 20). Returns `uid_hash, display_name, avatar_url`.

Summary and diagnostics:
 - `summary_counts` GET – counts { friend_requests, outgoing_requests, event_invites, unread_queue, upcoming_events }

Status updates (2008-style):
- `status_create` POST – add a status with visibility `public|contacts|private` (stored)
- `status_list` GET – returns the latest 50 for the current user only (alpha limitation)
  - Note: does not yet include contacts’ statuses fan-out; see constraints below
- `status_feed` GET – self + contacts feed (filters out others' private; returns latest 50)
  - Supports `offset` and `limit` (default 0/50). Response includes `next_offset`.
- `status_list_for?uid=` GET – profile wall for a specific uid, with viewer-aware visibility filtering

Events and RSVPs:
- `events_create` POST – create an event owned by current user
- `events_list` GET – list events owned by current user (alpha scope)
- `events_rsvp` POST – upsert RSVP status for current user
- `events_invite` POST – invite a recipient to an event
- `event_invites_incoming` GET – list pending invites for current user
- `event_invite_accept` POST – accept a pending invite
- `event_invite_decline` POST – decline a pending invite
- `event_invites_outgoing` GET – list your pending event invites you sent
- `event_invite_cancel` POST – cancel a pending invite you sent

Albums and photos:
- `albums_create` POST – create an album
- `albums_add_photo` POST – add a photo; optional tag users by uid
- `albums_list` GET – list current user’s albums with photos

Media helper:
- `media_presign` POST – signed URL for uploads to `media` bucket (not used by `/demo` yet)
 - Timestamp skew enforcement via `MAX_SKEW_MS` (default 90s) for signed requests.

Rate limiting (alpha):
- Table `rate_limits` with `rate_limit_increment(p_uid, p_key, p_window, p_limit)` RPC.
- Currently applied to: `status_create`, `events_create`, `contact_request_send`.

## Database schema (Postgres)

File: `supabase/sql/relay_schema.sql`. Key tables:
- `users_public(uid_hash, ed25519, x25519, updated_at)` – public key registry
- `invites(code, created_by, used_by, used_at)` – invite codes
- `queue_counters(uid_hash, last_n)` / `queue_messages(id, recipient_uid_hash, n, payload, created_at)` – per-recipient queue
- `profiles(uid_hash, display_name, avatar_url, bio, favorites_*, updated_at)`
- `contacts(owner_uid_hash, peer_uid_hash, nickname, created_at)` – directed list, FK to `profiles(uid_hash)` with error-tolerant creation
- `status_updates(id, uid_hash, content, visibility, created_at)`
- `events(id, owner_uid_hash, title, event_time, location, description, created_at)`
- `event_rsvps(event_id, uid_hash, status, updated_at)`
- `albums(id, owner_uid_hash, name, created_at)` / `album_photos(id, album_id, url, created_at)` / `photo_tags(photo_id, tagged_uid_hash)`

RPCs:
- `accept_invite(p_code, p_uid_hash)` – marks invite used
- `enqueue_message(p_recipient, p_payload) → bigint` – queue push, returns next `n`
- `fetch_queue(p_recipient, p_from, p_limit=100) → setof queue_messages` – ordered range
- `ack_queue(p_recipient, p_upto) → bigint` – delete up to `n`

Apply schema once per environment:
- Use Supabase SQL Editor and paste the file body; or
- Via psql (replace values):
  - `PGPASSWORD='<password>' psql '<pooler_url>' -f work/socii/supabase/sql/relay_schema.sql`

## Web wiring (/demo)

Page: `web/src/pages/demo.tsx`
- 3-column layout (left profile sidebar, center publisher + wall, right rail)
- Identity bootstrap + one-time registration with `relay.register`
- Deep-link `?invite=CODE` opens the invite overlay

Components (all under `web/src/components/demo/`):
- `ProfileSidebar` – pulls `profile_get` and `contacts_list` (preview of friends)
- `Composer` – posts statuses via `status_create`
- `StatusFeed` – lists statuses via `status_feed` (own + contacts), with client filters and pagination
- `PendingRequests` – lists and accepts via `contact_requests_incoming` and `contact_request_accept`
- `EventsPanel` – lists, creates, RSVPs via `events_*` routes
- `InviteOverlay` – `accept_invite`; also used as “Invite access” CTA
- `RightRail` – requests/notifications (counts), invite CTA, upcoming events

Support libs:
- `web/src/lib/identity.ts` – key management (deterministic seed, base32 phrase)
- `web/src/lib/relay.ts` – client for all routes; `withSig` builds auth headers
- `web/src/lib/useMounted.ts` – client-only rendering guard

## Environments and configuration

Web (`web/`):
- `NEXT_PUBLIC_RELAY_URL` – URL of deployed Supabase Edge Function `relay`
  - Example: `https://<project-ref>.functions.supabase.co/relay`

Relay function (`supabase/functions/relay/index.ts`):
- Needs a service Supabase client. One of the following pairs must be present:
  - `PROJECT_URL` + `SERVICE_ROLE_KEY` (preferred), or
  - `RELAY_SUPABASE_URL` + `RELAY_SERVICE_ROLE_KEY`, or
  - `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
- Optional:
  - `DEV_NOAUTH=1` – bypass signature checks (dev only)
  - `ADMIN_TOKEN` – enables `invites_generate`

Storage buckets:
- `avatars` (PUBLIC) – required by `avatar_upload` route to return public URLs
- `media` (PRIVATE/any) – used by `media_presign` if adopted later

## Local development

1) Web
- `cd web && npm install && npm run dev`
- Open `http://localhost:3000/demo`
- Ensure `NEXT_PUBLIC_RELAY_URL` is set (for Netlify deploys) or leave default for dev if pointing to a test function

2) Relay (Supabase)
- Paste and run `supabase/sql/relay_schema.sql` once
- Deploy the function via Supabase CLI or Dashboard and set env vars listed above
- For quick testing you may set `DEV_NOAUTH=1`

## Known constraints (alpha)

- Status feed shows only the current user’s statuses. It does not yet aggregate friends’ statuses (needs a join against `contacts` or a fan-out model).
- No server-side checks for timestamp skew or replay windows; consider enforcing ±90s.
- Identity and signatures live purely in the browser; secrets are stored in `localStorage` (good for alpha, not for production).
- Right rail numbers use `summary_counts`; detailed notifications model is not yet implemented.
- Error handling is graceful in the UI (empty states) to survive partially applied schemas; production should surface errors.
- Invite acceptance currently auto-connects inviter and invitee in `contacts` on the server (simple mutual link).

## Security notes

- Ed25519 signatures ensure only the key-holder can mutate their records, but without replay protection and skew enforcement, an attacker obtaining prior requests could attempt replays. Add a server-side skew window and consider storing a last-seen ts per uid to drop older requests.
- Service Role Key is required by the function; scope it to the environment and store only in server-side function env, never in the client.
- Public avatars bucket exposes images; avoid sensitive uploads there.

## Roadmap (near-term)

- Status feed: include contacts’ items (either query-time join or fan-out on write)
- Notifications model and counts in right rail
- Event invitations model (separate from RSVPs)
- Rate-limiting, ts skew checks, and optional signed URL uploads for media everywhere
- Mobile parity and deep links for invites and profiles

---

If you change any server routes or the schema, please update this file and `web/src/lib/relay.ts` types accordingly.


