# Choosr Chat security and operations

Choosr Chat is an isolated bounded context beside Choosr Choose. It uses the
same anonymous Supabase identity only for authorization; it does not expose
profiles, handles, phone numbers, social accounts, contact search, or
unsolicited invitations.

## Trust and encryption boundary

Each device creates a fresh X25519 (`nacl.box`) keypair for one chat. The private
app link and QR are two representations of the same 256-bit single-use token
and creator temporary public key. The joiner verifies that public key against
the key returned by the transactional join before deriving the shared key.
Messages use authenticated XSalsa20-Poly1305 secret-box envelopes with a new
192-bit nonce.

Manual invitation codes are deliberately unsupported because a human-sized
code cannot carry the creator public-key proof included in the link and QR.
Messaging is end-to-end encrypted immediately after key agreement. The
encryption-details panel optionally lets participants compare the same safety
number by phone, video, in person, or another trusted channel. Choosr does not
block messaging, ask users to claim they compared it, or display an
unverifiable matched/verified state. The safety number is derived on-device
from the shared key and is never sent to Choosr.

Temporary secret and shared keys exist only in application memory. They are
never written to AsyncStorage, platform key stores, Supabase, Realtime, Edge
Function requests, logs, analytics, notification payloads, or source control.
Plaintext messages are also memory-only. If the operating system terminates the
process, the keys are deliberately unrecoverable and the client destroys the
now-unreadable remote room on its next authenticated reconciliation.

Supabase stores only temporary public keys, nonces, ciphertext, message
identifiers, and lifecycle timestamps. The `chat_messages` table intentionally
has no plaintext content/body column. Edge Function error logging records only
an event name and error class; it never logs request bodies, room IDs, tokens,
keys, nonces, or ciphertext.

## Authorization and lifecycle

- Invitations expire after 90 seconds. Link/QR tokens persist only as SHA-256
  hashes.
- Redemption locks the invitation and room in one transaction, consumes the
  invitation once and admits only the unique `joiner` role.
- A private membership table enforces one active chat per user.
- RLS exposes active room, participant public-key, and ciphertext rows only to
  current members. Closed rooms expose no rows.
- Authenticated clients have no direct insert, update, or delete grants.
  Transactional functions recheck membership, state, participant count,
  expiration, envelope shape, idempotency, and rate limits.
- Create is limited to 5 attempts per 10 minutes, join to 10 per 10 minutes,
  and messages to 60 per minute. Messages are limited to a 16 KiB base64
  envelope; the client composer is capped at 2,000 characters.
- Realtime is used as a delivery hint. A three-second recovery poll and
  app-foreground refresh detect missed events and remote destruction.
- Either participant can invoke `destroy_chat_room`. The transaction closes the
  tombstone, deletes live ciphertext, invitations, generic message
  notifications, participant rows, and active memberships, and creates
  short-lived non-authorizing receipts so retries are idempotent.
- Local destruction overwrites key arrays and removes plaintext immediately.
  If offline, only the room ID is queued for a later destruction retry; no
  message or key material is persisted.
- A minute-level Cron job destroys unclaimed room shells when their invitation
  expires and all active rooms at 24 hours. Cleanup and participant destruction
  are idempotent.

## Notifications

Chat pushes contain only:

- title: `New private Choosr message`
- body: `Open Choosr to view it privately.`
- routing data: `kind=chat_message`, `route=Chat`

There is no preview, sender identity, room ID, token, key, nonce, or ciphertext
in the push. Already-delivered operating-system notifications cannot be
retracted when a room is destroyed, but they contain no conversation content.

## Threat model and privacy limitations

The design protects message content from Supabase/PostgreSQL, Realtime, Edge
Functions, server logs, analytics, push providers, and passive database
disclosure. It prevents token replay, expired-token admission, third-user
membership, direct client writes, and reopening after destruction.

A private link is a bearer capability: the first person to obtain and redeem it
can claim the only joiner slot. The custom `choosr://` URL is not fetched by web
or link-preview services, and it contains no room ID, profile, message, or
plaintext key material. The messaging service selected by the sender still
receives the invitation text, so links must not be posted publicly. In-person
QR plus optional safety-number comparison remains the strongest connection
check.

It does not protect an unlocked or compromised endpoint, and it cannot prevent
screenshots, screen recording, accessibility capture, malware, or an external
camera. A participant can manually copy anything they can read. Provider
backups may temporarily retain already-deleted ciphertext according to provider
retention and disaster-recovery policies; without the destroyed device keys,
that ciphertext is not readable by Choosr.

## Report & Destroy follow-up

`Report & Destroy` is intentionally not enabled in this iteration. A safe
implementation needs an explicit evidence-selection and informed-consent flow,
a separately authorized evidence destination, retention/deletion policy,
redaction and minimization rules, abuse-review access controls, and tests
proving that no decrypted content uploads before a user confirms the exact
selection. Adding a silent transcript upload or a server decryption path would
weaken the normal E2EE contract, so the UI currently offers only
`End & Destroy`.

## Deployment

Apply `20260724190000_add_ephemeral_chat.sql`, deploy `chat-session`, and deploy
the updated `dispatch-notifications`. Anonymous authentication, Realtime, Cron,
the existing Firebase service-account secret, and platform push configuration
must be enabled. No new static secret is required.

Native `choosr://chat` handling is configured for iOS and Android. A recipient
without Choosr must install the app and request a fresh short-lived invitation.
Automatic App Store/Play Store fallback and post-install continuation remain a
deployment follow-up until Choosr has a verified public web domain, published
store URLs, Apple Associated Domains, Android Digital Asset Links, and a
privacy-reviewed landing page. The invitation secret must remain outside web
requests, redirects, analytics, and store URLs.

Before promotion, run the repository application, secret, environment, format,
lint, typecheck, Jest, migration-reset, pgTAP, schema-lint, Android build, and
iOS simulator build gates. Validate physical iPhone-to-Android and
Android-to-iPhone camera scan, background push, process termination, temporary
network loss, simultaneous destruction, and screenshot disclosure messaging.
