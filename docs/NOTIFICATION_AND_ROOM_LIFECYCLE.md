# Notification and room lifecycle

This document is the production contract for Choosr room history, in-app
notifications, and provider push delivery.

## Authoritative state

PostgreSQL is the source of truth. A push job is never treated as proof that an
event is still actionable. The dispatcher validates the underlying database
record when it leases a job and again immediately before contacting FCM.

Every outbox event has:

- an immutable, unique `dedupe_key`;
- a five-minute `deliver_before` deadline;
- at most five provider attempts;
- exactly one terminal outcome: `delivered_at` or `discarded_at`;
- an auditable failure or discard reason.

FCM receives the remaining delivery window as its Android TTL and APNs
expiration. Android tags, FCM collapse keys, APNs collapse IDs, and foreground
notification IDs are stable for the outbox event so retries replace the same
visible alert instead of creating another card.

## Events

| Kind                 | Created when                                                   | Actionable while                                                               | Push destination | Terminal cleanup                                                                         |
| -------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------- | ---------------------------------------------------------------------------------------- |
| `connection_request` | A user sends a new Circle request                              | The connection is pending                                                      | Circle           | Accepting or declining removes the in-app event and discards any unsent push             |
| `room_invitation`    | A host invites an accepted Circle connection to a waiting room | The invitation is pending and unexpired, and its room is waiting and unexpired | Active Rooms     | Accept, decline, cancel, or expiry removes the in-app event and discards any unsent push |
| `chat_message`       | An encrypted message is committed for the other participant    | The private chat room is active, unexpired, and the recipient is a participant | Chat Home        | Destroying the chat deletes its messages, inbox events, and unsent jobs                  |

There are no provider pushes for room completion, matches, or no-match rounds.
A Choosr identity may have multiple registered devices; one valid event is sent
once to each active device because those devices are separate endpoints.

The in-app inbox and push window are intentionally different. An event may
remain useful in the app after its five-minute push deadline, but it must never
generate a delayed banner.

## Android alert behavior

Foreground and background delivery use the same versioned
`choosr-alerts-v2` channel with high importance, default sound, and vibration.
Android channels are immutable after creation, so changing behavior requires a
new channel version. Device silent mode, Do Not Disturb, and a user's explicit
per-channel settings remain authoritative.

## Room lifecycle

- Waiting and active rooms remain visible only until their room expiry.
- A cancelled or expired room cannot return a pending invitation.
- A recipient can explicitly dismiss a valid invitation.
- A matched or completed room gets a server-stamped `completed_at`.
- Both participants see the completed result until exactly 24 hours after
  `completed_at`, independently of either participant pressing Done.
- Done records acknowledgment and exits the screen; it does not delete shared
  history.
- A participant may delete one completed result or clear all completed results
  from their own history. This records a per-participant dismissal and never
  changes the room or the other participant's history.
- Historical result screens are read-only, identify the other participant by
  profile name and photo when available, and return to the completed list.
- Cleanup expires completed history only after the 24-hour window.

## Delivery guarantees

The database guarantees one logical job per dedupe key, bounded attempts,
state validation, and a hard delivery deadline. FCM and APNs are external
at-least-once systems, so absolute network-level exactly-once delivery is not
possible. Stable provider collapse identifiers and client notification IDs
make retries effectively once from the user's perspective while preserving a
durable audit trail for operators.
