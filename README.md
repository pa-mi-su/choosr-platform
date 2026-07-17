# Choosr Platform

Choosr helps a couple decide what to watch, what to eat, or what to do. One person
creates a private room, invites their partner, and both swipe independently through
the same decision deck. The first option they both like becomes the match.

This is a React Native Community CLI project with complete native Xcode and Gradle
projects. It does not use Expo.

## Current status

The mobile MVP includes Watch, Eat, and Do mode selection; real host and join flows;
native invitation sharing; generic decision cards; accessible controls; key-free Maps
handoff for local matches; private persisted swipes; and authoritative match/no-match outcomes.

The Phase 2 foundation now includes a Supabase React Native client, persisted anonymous
sessions, a five-table PostgreSQL schema, decision modes, immutable item snapshots, Row
Level Security, authenticated database functions, Realtime configuration, a protected
content-provider Edge Function, pgTAP coverage, Realtime room updates, reconnect recovery,
and a polling fallback. The hosted project must receive the migration before physical
devices can use the room flow.

## Requirements

- Node.js 24 (`.nvmrc` included; React Native 0.86 requires Node 22.11+)
- Xcode and CocoaPods
- Android Studio, Android SDK, and Java 21

## Install and run

```sh
nvm use
npm install
cd ios && pod install && cd ..
npm start
```

In another terminal:

```sh
npm run ios
npm run android
```

Rooms require two distinct anonymous device identities. The host remains on the waiting
screen until a second device joins with the generated code. Watch, Eat, and Do fallback
decks live under `src/data`; live adapters are in `supabase/functions/build-deck` and
activate after server-side provider credentials are configured.

Before starting Metro or a native build, create `.env` from `.env.example`. Only the
Supabase project URL and publishable key belong in the mobile configuration. The npm
scripts generate an ignored `src/config/generatedEnv.ts` module so the Community CLI
build can consume `.env` without Expo.

## Local Supabase

Docker Desktop is required for the local backend. Supabase's local development services
use shared development credentials and may publish ports on every network interface, so
run them only on a trusted network and stop them when testing is complete.

```sh
npm run supabase:start
npm run supabase:reset
npm run supabase:lint
npm run supabase:test
npm run supabase:stop
```

Database migrations and tests live under `supabase/`. See `supabase/README.md` for the
security model and hosted deployment checklist.

## Verification

```sh
npm run typecheck
npm run lint
npm test -- --runInBand
npm run supabase:lint
npm run supabase:test
```

## Security

- Never commit `.env`, signing keys, service-role keys, or store credentials.
- Only a Supabase publishable key belongs in the mobile client.
- TMDB and Google Places access are proxied through a Supabase Edge Function.
- Deployed sessions use Row Level Security and expire automatically.
- Clients have no direct INSERT, UPDATE, or DELETE grants on application tables.
- Individual swipe rows can only be selected by the participant who created them.

The revised approved direction is documented in `docs/PRODUCT_CHARTER.md`. The latest
architecture, SOLID, security, and release-readiness review is in
`docs/ENGINEERING_AUDIT.md`. Brand references, palette, and app-icon rules are in
`docs/VISUAL_DIRECTION.md`.

## Identifiers

- iOS: `com.choosr.app`
- Android: `com.choosr.app`
