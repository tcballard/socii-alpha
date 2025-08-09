# Socii – Mobile Implementation & Integration Plan (Expo / RN)

This plan defines how we will evolve the current prototype into a PRD‑aligned app using Clerk (auth), Supabase (backend + storage + RLS), RevenueCat (paywalls/entitlements), and Stripe (payments), while preserving the 2008 Facebook aesthetic.

## 1) Objectives
- Ship a working beta that meets PRD MVP scope with mock→prod toggle
- Validate PMF metrics (trial → paid, connections added week 1, sessions 5–10 min)
- Keep code modular so we can iterate without large refactors

## 2) Tech Stack & Packages
- Expo SDK 53 (RN 0.79), React Navigation
- Clerk Expo (auth)
- Supabase JS (database, storage, edge functions)
- RevenueCat Purchases (Expo plugin) for subscriptions + entitlements
- Stripe (Checkout Portal on web, RevenueCat for in‑app)
- Expo file-system + sharing for data export

Environment: `.env` values loaded with `expo-constants` and `app.config.*` → secrets injected at build time.

## 3) App Architecture
```
src/
  components/
  navigation/
  redux/
  screens/
  services/
    auth.ts         // Clerk session helpers, user bootstrap
    supabase.ts     // Supabase client, RPC helpers
    storage.ts      // Upload/download helpers (avatars, post media)
    revenuecat.ts   // Entitlement checks, paywall triggers
    payments.ts     // Stripe web checkout deep-links
  utils/
  styles/
```

Feature flag: `USE_MOCKS=true|false` determined from env; services layer exports mocked or real implementations accordingly.

## 4) Data Model (Supabase)
Tables (primary fields only):
- `users` (id PK, email, name, join_date, trial_start_at, avatar_url)
- `connections` (id PK, user_id, peer_id, status: pending|connected|blocked, category: family|friends, muted bool, archived bool)
- `posts` (id PK, user_id, content text, life_event enum, audience enum, created_at)
- `post_media` (id PK, post_id FK, url, type image|video, order)
- `comments` (id PK, post_id FK, user_id, content, created_at)
- `likes` (id PK, post_id FK, user_id, created_at)
- `notifications` (id PK, user_id, type, message, related_post_id, related_user_id, read bool, created_at)
- `invites` (code PK, created_by, email optional, used_by, used_at)
- `tiers` (id, code, name, connection_limit, price)
- `user_tier_overrides` (user_id, tier_code, expires_at, source: trial|rc|stripe)

Storage buckets: `avatars`, `post-media`.

### RLS (Row Level Security) Outline
- `users`: user can select/update own row
- `posts`: row owner write; readers are owner + approved connections filtered by `audience`
- `comments`/`likes`: owner write; readers if can read post
- `connections`: user can select rows where `user_id = auth.uid()` or `peer_id = auth.uid()`; writes restricted
- `notifications`: only recipient can read/write `read` flag
- `invites`: validate on signup via RPC/edge

## 5) Auth & User Bootstrap (Clerk)
- Use Clerk for sign in/up (email/password or magic link)
- Signup form collects: name, invite code (optional in beta), privacy consent checkbox
- On first session, create/update `users` row in Supabase and set `trial_start_at` if first login
- Derive in Redux from Clerk user object; persist minimal local UI preferences only

## 6) Subscriptions (RevenueCat + Stripe)
- RevenueCat entitlements map to connection limits:
  - `inner_25`, `close_50`, `full_100`, `family_150`
- 30‑day free trial: intro offer or trial entitlement with an expiration
- Mobile paywalls: RevenueCat `presentPaywall()` (platform‑specific)
- Web: Stripe Checkout deep‑link, webhook updates Supabase & RC
- On entitlement change, sync a mirror of plan state into Supabase for server checks

## 7) Feature Implementation Map (PRD → App)
- Feed (chronological): Supabase select ordered `created_at desc`, paginated; composer supports text + up to 10 media
- Connections: search by email, request/approve/mute/archive, categories editable; enforce connection limit against entitlement
- Notifications: generated via DB triggers/edge on like/comment/connection events; list, mark read/all read
- Settings: dark mode, data export (JSON of user’s data), delete account (server procedure)
- Trial Gating: banner with days remaining; block “add connection” when limit reached; gentle paywall prompt
- Invite‑only Beta: require valid `invites.code` during signup (feature flag)

## 8) Services Layer Contracts
- `auth.ts`: `getSession()`, `getCurrentUser()`, `requireInvite(code)`, `bootstrapUser()`
- `supabase.ts`: `getFeed({cursor})`, `createPost(data)`, `getNotifications()`, `markNotification(id)`, `searchUsers(email)`, `requestConnection(peerId)`, `approveConnection(id)`, `updateConnection(id, payload)`
- `storage.ts`: `uploadAvatar(uri)`, `uploadPostMedia(uris[])`
- `revenuecat.ts`: `getEntitlements()`, `showPaywall()`, `isTrialActive()`
- `payments.ts`: `openStripeCheckout(tierCode)`

## 9) Milestones & Sequence (gpt5 branch)
1. Services scaffolding + feature flag (mock vs real)
2. Clerk session → Supabase user bootstrap + trial start
3. Posts: read/write from Supabase; storage upload; migrate Feed to real data
4. Connections: search/request/approve; categories; mute/archive; enforce entitlement limit client + server
5. RevenueCat paywall + trial countdown + Stripe web flow stub
6. Notifications from Supabase + mark read
7. Data export (JSON) + delete account (server RPC)
8. Analytics events & in‑app debug screen (targets from PRD)
9. Polish pass: 2008 brand, perf (skeletons, getItemLayout), accessibility

## 10) Edge Functions / Triggers (Supabase)
- Trigger on `likes`, `comments`, `connections` → insert `notifications`
- RPC `accept_invite(code)` validates and marks used
- RPC `export_user_data(uid)` aggregates user data for export
- RPC `delete_user(uid)` cascades deletes + storage
- Optionally cron to expire trials and sync RevenueCat → Supabase

## 11) Analytics & Metrics (PRD alignment)
Events (client → Supabase or privacy‑safe provider):
- Auth: trial_started, signup_completed (with invite_code_used)
- Activation: first_post_time, connections_added_week1
- Engagement: post_created, comment_created, like_created, session_start/stop
- Monetization: paywall_shown, purchase_started/completed, entitlement_changed
Derived metrics: trial→paid conversion, posts per user/week, comments per post, WAU of mutual connections, session duration.

## 12) Testing & Quality
- Unit tests for reducers and services contracts (mocks)
- E2E smoke (Detox/Expo Go) later
- Lint + type readiness (TS migration after beta)
- Dev “Debug” screen to inspect entitlements, trial days left, counts

## 13) Security & Compliance
- RLS enforced on all tables
- Validate ownership for uploads
- Clerk webhook to disable sessions on account deletion
- Export/delete flows to meet PRD privacy goals

## 14) Brand & UX (2008 Aesthetic)
- Solid blue header, square avatars (1 px border, 2 px radius), compact cards with 1 px borders
- Link‑blue inline actions; minimal gradients; small icons (18–22 px)
- Keep dark mode optional, default to light

## 15) Risks & Mitigations
- Auth/entitlement drift → single source of truth in RevenueCat mirrored to Supabase; periodic reconciliation
- RLS mistakes → start with restrictive policies, open gradually; add tests
- Media costs → limit media count/size; compress on client
- Trial abuse → invite‑only beta; device guard (soft), server checks

## 16) Open Questions
- Final tier pricing vs PRD table (intro pricing?)
- Invite code source of truth: Supabase only or also Clerk metadata?
- Web paywall path: Stripe only, then sync to RC, or RC → Stripe mapping?

---

Execution will begin with Milestone 1 on branch `gpt5`. After each milestone, we’ll run Expo build, verify regressions, and open a small PR for review.

