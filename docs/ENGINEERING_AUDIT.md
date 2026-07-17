# Choosr Engineering Audit

Date: 2026-07-17
Scope: mobile application, Supabase schema and RPCs, Edge Function provider boundary,
automated tests, dependency and secret hygiene

## Result

The foundation is suitable for continued MVP development. The code now has explicit
domain boundaries for decision items, sessions, and content providers; privileged writes
remain behind database functions; and untrusted provider/deck data is validated before it
crosses a boundary. No Expo dependency or committed secret is present.

This audit does **not** classify the app as production ready. The mobile screens now use
anonymous Auth, server-created rooms, persisted private swipes, Realtime events, polling
fallbacks, reconnect recovery, and authoritative matches. The database migration is live
and its hosted host/partner/third-user, RLS, match, and Realtime paths are verified.
Provider credentials, physical cross-device acceptance tests, and store-release work remain.

## Design and SOLID review

- **Single responsibility:** provider authentication, HTTP responses, request parsing,
  presentation shaping, Watch lookup, and Places lookup are separate Edge Function modules.
- **Open/closed:** Watch and Places implement the same normalized `DecisionItem` boundary;
  another decision provider can be added without changing session persistence.
- **Liskov substitution:** every provider returns the same validated decision-deck contract.
- **Interface segregation:** the mobile session service consumes session RPC results and a
  small runtime parser instead of provider-specific response shapes.
- **Dependency inversion:** UI/domain code depends on normalized decision items rather than
  TMDB or Google Places records.

Patterns used deliberately: provider adapters, service boundary, normalized domain model,
database transaction script/RPC, immutable room snapshots, and server-authoritative match
creation. Additional abstraction should be introduced only when a second implementation or
real variation requires it.

## Findings remediated

1. Removed obsolete movie-only RPCs that duplicated the generic decision-mode APIs.
2. Replaced an unsafe JSON type assertion with runtime validation of stored deck items.
3. Centralized database deck validation with bounded payload, item count, field lengths,
   mode consistency, required fields, and duplicate-ID rejection.
4. Split the content Edge Function into testable authentication, transport, request,
   presentation, and provider-adapter modules.
5. Removed an unsafe non-null assertion in match action handling.
6. Replaced hexadecimal fallback codes with eight unambiguous base-32 characters (40 bits),
   aligned the app input with the database contract, and limited each identity to 20 room
   creations per rolling 24 hours.
7. Expanded pgTAP and Jest coverage for generic decision modes, cross-mode rejection,
   oversized payload rejection, malformed persisted items, and unsafe action URLs.
8. Removed the local partner timer, hardcoded room code, and simulated partner likes; room
   readiness and matches now come only from authenticated database state.
9. Added reconnect-safe deck resumption, missed-event polling, automatic second-round
   synchronization, and user-facing network/room errors.
10. Deployed the reviewed migration and verified hosted anonymous Auth, exact two-person
    admission, private-swipe RLS, authoritative matching, and Realtime participant/match
    notifications with independent clients.

## Security posture

- Application tables use Row Level Security and deny direct client writes.
- Security-definer RPCs authenticate the caller, validate inputs, and use an empty search
  path.
- Invite tokens are high entropy and only their SHA-256 hashes are stored.
- Manual codes avoid ambiguous characters and provide approximately 40 bits of entropy.
- Only HTTPS action URLs are accepted from persisted/provider payloads.
- Provider credentials belong only in Edge Function secrets; the mobile app receives only
  the Supabase project URL and publishable key.
- Anonymous sign-in should have CAPTCHA enabled in hosted Supabase before public launch.

## Remaining release blockers

1. Deploy the provider Edge Function and configure server-side provider secrets when live
   content is enabled; keep the current key-free fallback decks until then.
2. Put manual-code joins behind an abuse-controlled server boundary or equivalent rate
   limiting before a public launch; code entropy alone is not a complete abuse control.
3. Configure provider quotas and graceful fallback behavior, and verify licensing and
   attribution for TMDB, Places, and Maps.
4. Run iPhone/iPhone, Android/Android, and cross-platform physical-device acceptance tests,
   including expired rooms, network loss, duplicate swipes, and third-user rejection.
5. Add universal/app links, privacy and terms pages, data-retention cleanup, store assets,
   production signing, crash reporting, and release pipelines.

## Engineering rules for follow-up work

- Keep UI, domain models, persistence, and external providers separated.
- Validate at every trust boundary; TypeScript types do not validate network or JSON data.
- Prefer small composable modules and explicit interfaces over large screens or services.
- Keep matching and authorization server-authoritative and transactionally tested.
- Add a regression test with every defect fix and keep credentials out of source control.
- Avoid speculative abstractions, mutable shared state, and provider-specific fields in UI.
