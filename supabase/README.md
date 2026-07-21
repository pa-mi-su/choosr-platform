# Choosr Supabase backend

This directory is the source of truth for the Choosr database. Do not make production
schema changes only through the dashboard; create and test a migration here first.

## Security model

- Mobile clients authenticate as unique anonymous Supabase users.
- Application tables have Row Level Security enabled.
- Authenticated clients receive read access only; all table writes are revoked.
- Security-definer RPC functions validate membership and perform writes atomically.
- A session has one unique host role and one unique partner role.
- `swipes` RLS permits a participant to select only their own decisions.
- The unique match constraint and session row lock prevent duplicate matches.
- Invite tokens are stored as SHA-256 hashes; plaintext tokens are returned once.
- Circle connections are mutual; handle requests require acceptance and shared contact
  links use one-use, seven-day tokens stored only as SHA-256 hashes.
- Room invitations are bound to an accepted connection and a specific recipient identity.
- Push endpoints are private, and notification events enter a service-role-only outbox.
- Expiration and cleanup logic is database-owned.
- Anonymous cleanup tracks actual room activity and preserves identities in live rooms.

## Files

- `migrations/20260717134500_initial_choosr_schema.sql`: tables, decision modes,
  immutable item snapshots, RLS, functions, grants, and Realtime publications.
- `migrations/20260717162000_schedule_data_retention.sql`: private activity ledger,
  guarded anonymous-user retention, and two Supabase Cron jobs.
- `migrations/20260717173000_add_circle_and_room_invitations.sql`: optional profiles,
  accepted connections, contact-safe connection links, recipient-bound room invitations,
  push-token/outbox boundaries, and Circle retention.
- `migrations/20260717174500_fix_circle_rpc_ambiguity.sql` and
  `20260717175000_fix_room_invitation_conflict.sql`: forward-only production lint fixes.
- `tests/database/0001_schema.test.sql`: structural and privilege assertions.
- `tests/database/0002_session_flow.test.sql`: host/partner flow, third-user
  rejection, private swipe visibility, and atomic match behavior.
- `tests/database/0003_decision_modes.test.sql`: multi-mode rooms, frozen payloads,
  validation, and stable item ordering.
- `tests/database/0004_retention.test.sql`: Cron registration, retention boundaries,
  permanent-user safety, and live-room protection.
- `tests/database/0005_circle.test.sql`: Circle identity, connection, contact-link,
  room-invitation, and notification-outbox behavior.
- `functions/build-deck`: authenticated Google Places provider adapter for Eat and Do.
- `seed.sql`: intentionally empty because decks are session-specific.

## Local verification

```sh
npm run supabase:start
npm run supabase:reset
npm run supabase:lint
npm run supabase:test
npm run supabase:stop
```

Local development intentionally excludes provider and push credentials. Edge Functions are
deployed only by GitHub Actions, which copies the matching GitHub environment secrets into the
target Supabase project. Mobile clients invoke the authenticated `dispatch-notifications`
function after transactional outbox writes; hosted environments should also add an independently
monitored retry schedule before public launch.

## Hosted deployment checklist

1. Confirm anonymous authentication is enabled in the intended Supabase project.
2. Configure the target GitHub environment variables and secrets documented in
   `docs/DEPLOYMENT_AND_PIPELINES.md`.
3. Review the GitHub Actions dry-run output.
4. Let the environment-gated workflow apply migrations, synchronize Edge Function secrets,
   and deploy both functions.
5. Run database lint and pgTAP tests against the linked project.
6. Verify no secret/service-role key exists in the mobile configuration, Git, or local files.

All migrations are deployed to the hosted Choosr project. The room implementation has passed hosted
host/partner/third-user, private-swipe RLS, authoritative-match, and Realtime verification.
Continue to treat migrations in this directory as the source of truth for future changes.
