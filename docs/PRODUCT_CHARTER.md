---
title: Choosr MVP Product and Technical Charter
status: Approved Revised Direction
version: 2.0
date: 2026-07-17
platforms: [iOS, Android]
confidentiality: Confidential project
---

# Choosr MVP Product and Technical Charter

## Product promise

Choosr helps exactly two people decide together without exposing individual rejections.
One person opens a private temporary room, chooses a decision mode, and invites their
partner. Both receive the same ordered options and swipe independently. Choosr reveals
only the first option both people accept.

> Stop debating. Choose separately and match together.

## Initial decision modes

### Watch

- Movies from TMDB
- Movie details and regional watch-provider information where permitted
- TMDB attribution and licensing compliance

### Eat

- Cuisine matching with no third-party credential required
- Key-free handoff to a local Maps search after matching
- Exact nearby restaurant decks through Google Places when configured
- Optional location or manually entered search area

### Do

- Curated date ideas such as coffee, drinks, bowling, parks, museums, and live music
- Key-free handoff to Maps after matching
- Exact nearby place decks through Google Places when configured

The shared architecture may support new modes later, but the first release is limited to
Watch, Eat, and Do.

## MVP scope

Included:

- React Native Community CLI and TypeScript
- Standard native iOS and Android projects
- No Expo packages, runtime, Go, or EAS
- Exactly two participants: host and partner
- Invisible anonymous authentication
- Temporary private rooms and unambiguous eight-character fallback codes
- Native invitation sharing and future universal links
- One identical ordered deck per round
- Private left/right decisions
- Realtime presence and authoritative matches
- Reconnection-safe match records
- No-match and fresh-round behavior
- Decision mode and immutable item snapshot stored with every room deck
- Watch, Eat, and Do experiences
- Automatic room expiration and cleanup
- Privacy, provider attribution, and store-release configuration

Excluded from the first release:

- Groups or more than two participants
- Accounts, email, telephone, passwords, or permanent profiles
- Chat, public rooms, social graphs, or user-generated content
- Payments, subscriptions, advertising, or paid analytics
- Web or desktop applications beyond invite/privacy support
- Paid build or hosting services
- Advanced recommendation algorithms

## Core user flow

1. Host opens Choosr and selects Watch, Eat, or Do.
2. For local modes, the host may select a search area or use curated choices.
3. Choosr creates an anonymous identity and a temporary private room.
4. The server freezes one ordered decision deck for the room.
5. Host shares the invite link or fallback code.
6. Partner joins and receives the same deck.
7. Both swipe privately.
8. The database atomically creates the first mutual match.
9. Both devices show the match; local results can open in Maps.

## Privacy and location

- Location is requested only after the user chooses a local mode.
- Current location is optional; city, neighborhood, or postal-code input is the fallback.
- Search position is used to build the temporary deck and is not a permanent profile.
- The partner sees shared results, not the host's raw location permission state.
- Individual swipes are visible only to the participant who created them.
- Invite tokens are high entropy and stored only as hashes.
- Sessions expire after 24 hours by default.

## Technology

- React Native Community CLI, TypeScript, React Navigation
- Gesture Handler, Reanimated, AsyncStorage
- Supabase anonymous Auth, PostgreSQL, RLS, Realtime, Edge Functions
- TMDB for Watch content
- Google Places Nearby Search for configured exact Eat/Do places
- Google/Apple Maps URLs for zero-key local-search handoff
- Cloudflare Pages free tier for invite fallback, privacy, and app-link files
- Jest, React Native Testing Library, ESLint, Prettier, and pgTAP

## Provider security and cost policy

- Mobile configuration contains only the Supabase URL and publishable key.
- TMDB and Google Places credentials are server-side Supabase secrets.
- Provider responses are normalized into generic decision items.
- The complete normalized deck is frozen in `session_items.item_payload` for both people.
- Provider fields are minimized and quotas must be configured before production use.
- Cuisine/activity matching and Maps handoff remain available without a paid API.
- No infrastructure may automatically upgrade to a paid tier.

## Release acceptance

- iPhone-to-iPhone, Android-to-Android, and both cross-platform pairings pass.
- A third participant cannot join.
- One person's swipe history cannot be read by the other.
- Both devices receive the same ordered deck and authoritative match.
- Watch, Eat, and Do each complete a full room-to-match flow.
- Location denial has a functional manual/fallback path.
- Provider credentials and signing files are absent from Git.
- Privacy, TMDB, Places/Maps, and open-source notices are present where required.
