# Choosr Engineering Audit

Date: 2026-07-26
Scope: mobile application, native projects, Supabase schema/RPCs, Edge
Functions, automation, dependencies, and secret hygiene

## Current result

The application has maintained boundaries for Choose, Circle, and ephemeral
Chat. Authoritative room state, two-person admission, private choices, matching,
notifications, and Chat lifecycle rules remain in PostgreSQL/RPCs with RLS and
database tests. Provider credentials and notification-worker credentials remain
server-side.

This audit removed only code with no production caller and corrected
operational drift. It intentionally did not combine large screen decomposition
or duplicated-flow refactors with notification recovery because those changes
carry broader regression risk.

## Remediated in this pass

1. Separated OS notification permission from APNs/FCM/backend endpoint health.
   A network or registration failure can no longer be presented as disabled
   device settings.
2. Consolidated push repair under the application lifecycle instead of having
   multiple screens launch competing registration attempts.
3. Preserved bounded APNs recovery and versioned FCM token rotation for stale
   iOS installations.
4. Prevented raw FCM response bodies and photo-provider failure causes from
   entering application logs or persisted job errors.
5. Added `App.tsx` to native CI change detection.
6. Removed unused deck-fetch/fallback code, unused website-preview extraction,
   unused packages, stale push-storage markers, and an obsolete Xcode scheme.
7. Corrected deployment, Chat migration, and provider-image documentation.

## Verified invariants

- Direct application-table writes remain denied where RPC ownership is
  required.
- Security-definer RPCs authenticate callers and database authorization remains
  server-authoritative.
- Push payloads remain generic; private Chat plaintext is not sent to push,
  Supabase, logs, or analytics.
- Registration and provider diagnostics retain canonical error codes only.
- Applied migrations remain immutable; cleanup does not rewrite migration
  history.
- Native Dev/UAT/Prod schemes and Android flavors remain the supported build
  targets.

## Deliberately deferred

- Split the largest screens into feature-local presentation components.
- Consolidate duplicated room-invitation acceptance and match-navigation
  orchestration after dedicated regression tests are in place.
- Add an Edge Function compile/bundle preflight that runs before hosted database
  mutation; the current CLI has no local dry-run deploy mode, so this needs a
  separately verified Deno gate rather than an untested workflow edit.
- Continue physical-device acceptance across iPhone/iPhone, Android/Android,
  and cross-platform pairs for background delivery, force termination, token
  rotation, weak connectivity, expired rooms, and third-user rejection.

## Follow-up rules

- Keep UI, domain models, persistence, and external providers separated.
- Validate every network and JSON boundary at runtime.
- Prefer small interfaces and explicit results over booleans that conflate
  independent states.
- Add a regression test with every defect fix.
- Never log or commit credentials, tokens, invitation secrets, key material,
  private content, or sensitive provider responses.
