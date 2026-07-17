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
- Expiration and cleanup logic is database-owned.
- Anonymous cleanup tracks actual room activity and preserves identities in live rooms.

## Files

- `migrations/20260717134500_initial_choosr_schema.sql`: tables, decision modes,
  immutable item snapshots, RLS, functions, grants, and Realtime publications.
- `migrations/20260717162000_schedule_data_retention.sql`: private activity ledger,
  guarded anonymous-user retention, and two Supabase Cron jobs.
- `tests/database/0001_schema.test.sql`: structural and privilege assertions.
- `tests/database/0002_session_flow.test.sql`: host/partner flow, third-user
  rejection, private swipe visibility, and atomic match behavior.
- `tests/database/0003_decision_modes.test.sql`: multi-mode rooms, frozen payloads,
  validation, and stable item ordering.
- `tests/database/0004_retention.test.sql`: Cron registration, retention boundaries,
  permanent-user safety, and live-room protection.
- `functions/build-deck`: authenticated TMDB and Google Places provider adapter.
- `seed.sql`: intentionally empty because decks are session-specific.

## Local verification

```sh
npm run supabase:start
npm run supabase:reset
npm run supabase:lint
npm run supabase:test
npm run supabase:stop
```

## Hosted deployment checklist

1. Confirm anonymous authentication is enabled in the intended Supabase project.
2. Log the CLI into the correct Supabase account.
3. Link this repository to the project and verify the project reference.
4. Review `supabase db push --dry-run` output.
5. Apply the migration with `supabase db push`.
6. Add `TMDB_API_READ_TOKEN` and, when exact local places are enabled,
   `GOOGLE_PLACES_API_KEY` as Supabase secrets.
7. Deploy the `build-deck` Edge Function.
8. Run database lint and pgTAP tests against the linked project.
9. Verify no secret/service-role key exists in the mobile configuration or Git.

Both migrations are deployed to the hosted Choosr project. The room implementation has passed hosted
host/partner/third-user, private-swipe RLS, authoritative-match, and Realtime verification.
Continue to treat migrations in this directory as the source of truth for future changes.
