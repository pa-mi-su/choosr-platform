# Choosr production security

This document is the operational counterpart to the controls enforced in code.
It deliberately contains no credentials, phone numbers, user content, or API
keys.

## Enforced in the repository

- All application tables use row-level security and clients have no direct
  table write grants.
- Sensitive writes use authenticated, security-definer RPCs with fixed search
  paths.
- Room creation, invitations, handle lookups, invite redemption, reports, and
  external-provider calls have atomic database rate limits.
- Edge Functions enforce both per-user and salted per-network budgets. Raw
  client addresses are never stored.
- Administrative account controls are checked before every PostgREST request
  and by user-facing Edge Functions.
- Safety reports require a real prior interaction. Report tables cannot be read
  from a client.
- Uploads have bucket size/MIME restrictions, exact owner path formats, object
  count ceilings, client magic-byte validation, and Storage-API cleanup.
- Anonymous identities are retained for 90 days after activity. Linked
  identities are never removed by anonymous cleanup.
- Pending anonymous phone changes older than 30 minutes are cleared to prevent
  ambiguous OTP verification.
- Native auth refresh tokens use iOS Keychain or Android Keystore-backed
  encrypted storage. Existing sessions migrate without changing user IDs.
- Production Android builds use R8 minification and resource shrinking.
- CI rejects committed credentials and critical runtime dependency advisories.
  Actions are commit-pinned, Dependabot is configured, and CodeQL runs on
  changes and weekly.

## Required GitHub environment secrets

Each of `dev`, `uat`, and `prod` requires independent values:

- `EDGE_RATE_LIMIT_HMAC_SECRET`: at least 32 random bytes encoded as 64
  hexadecimal characters.
- `STORAGE_CLEANUP_TOKEN`: at least 32 random bytes encoded as 64 hexadecimal
  characters.

The deployment workflow writes these to Supabase Edge Function secrets. The
cleanup token is also stored in Supabase Vault for the daily database job.
Never put either value in a mobile `.env` file.

## Required hosted Auth configuration

Local desired defaults are recorded in `supabase/config.toml`, but hosted Auth
settings must be verified independently for Dev, UAT, and Production:

1. Anonymous sign-ins enabled.
2. Manual identity linking enabled.
3. Phone provider enabled with a production SMS provider.
4. SMS OTP expiry and resend limits set conservatively.
5. CAPTCHA enabled after the native challenge and provider keys are configured.
6. Redirect URLs limited to owned Choosr HTTPS domains.

Do not activate phone recovery in a public build until the SMS provider is
configured and an end-to-end link/recover test has passed in Dev and UAT.
`PHONE_RECOVERY_ENABLED` is a GitHub environment variable and defaults to
`false`; enable it independently in Dev, then UAT, then Production only after
that environment passes the test.

## Required verified-link configuration

Custom `choosr://` links remain a compatibility fallback. Production invitations
should use an owned HTTPS domain with:

- Apple `apple-app-site-association` entries for every environment bundle ID.
- Android `assetlinks.json` entries for every environment application ID and
  release signing certificate.
- Association files served over HTTPS without redirects.

The domain must be chosen before entitlements, intent filters, and generated
share URLs can be finalized.

## Operational review

- Review open `user_reports` and `private.security_events` using a trusted
  service/admin tool, never a public client.
- Apply suspensions with the service-only `set_account_control` RPC and also
  revoke/ban the Auth user through the Supabase Admin API when immediate refresh
  token invalidation is required.
- Investigate rate-limit spikes without exporting raw user content.
- Rotate provider and cleanup secrets on suspected exposure.
- Restrict Firebase/Google client API keys by application ID/bundle ID and
  required APIs. Client Firebase keys are identifiers, but unrestricted keys
  still create quota and abuse risk.
- Review dependency alerts weekly. Do not apply forced React Native downgrades
  solely to satisfy an advisory affecting build/test tooling.
