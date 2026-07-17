# Choosr Platform

Choosr helps a couple decide what to watch. One person creates a private room,
invites their partner, and both swipe independently through the same movie deck.
The first movie they both like becomes the match.

This is a React Native Community CLI project with complete native Xcode and Gradle
projects. It does not use Expo.

## Phase 1

The local product prototype includes host and join flows, native invitation sharing,
gesture-driven cards, accessible controls, a deterministic partner simulation, and
match/no-match outcomes. Supabase, TMDB, and production invite links are Phase 2.

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

The local preview automatically simulates a partner joining. Its movie data and
partner choices live under `src/data` and will be replaced by Supabase in Phase 2.

## Verification

```sh
npm run typecheck
npm run lint
npm test -- --runInBand
```

## Security

- Never commit `.env`, signing keys, service-role keys, or store credentials.
- Only a Supabase publishable key belongs in the mobile client.
- TMDB access will be proxied through a Supabase Edge Function.
- Production sessions will use Row Level Security and expire automatically.

## Identifiers

- iOS: `com.choosr.app`
- Android: `com.choosr.app`
