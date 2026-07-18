# Push notification dispatcher

This authenticated Edge Function leases pending rows from `notification_outbox`
and delivers them through the Firebase Cloud Messaging HTTP v1 API. FCM routes
iOS messages through APNs and delivers Android messages directly.

Required hosted secret:

- `FIREBASE_SERVICE_ACCOUNT_BASE64`: base64-encoded Firebase service-account JSON.

Never place the APNs `.p8` key or Firebase service-account JSON in this repository.
