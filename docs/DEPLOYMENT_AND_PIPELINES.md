# Choosr deployment and pipeline model

Choosr uses the same controlled promotion model as Sanctuary:

```text
feature/* -> dev -> uat -> prod -> main
```

`prod` is the final release-candidate branch. `main` is the released production source of
truth and the only branch allowed to deploy the production backend or produce a production
store candidate.

## Branch responsibilities

| Branch               | Responsibility                 | Runtime target                                    |
| -------------------- | ------------------------------ | ------------------------------------------------- |
| `feature/*`, `fix/*` | Isolated engineering work      | Local services only                               |
| `dev`                | Integrated development         | Development Supabase/Firebase and internal builds |
| `uat`                | Acceptance candidate           | UAT Supabase/Firebase and closed testing          |
| `prod`               | Final release-candidate review | Validation only; no production deployment         |
| `main`               | Released source of truth       | Production Supabase/Firebase and store candidate  |

Changes must promote in order. A feature branch must never merge directly into `uat`, `prod`,
or `main`. Emergency fixes start from `main`, receive an isolated fix branch, and are merged
back through every environment branch after the production repair.

## Native environment identities

| Environment | iOS bundle ID           | Android application ID  | iOS scheme    | Android flavor |
| ----------- | ----------------------- | ----------------------- | ------------- | -------------- |
| Development | `com.pamisu.choosr.dev` | `com.pamisu.choosr.dev` | `Choosr-Dev`  | `dev`          |
| UAT         | `com.pamisu.choosr.uat` | `com.pamisu.choosr.uat` | `Choosr-UAT`  | `uat`          |
| Production  | `com.pamisu.choosr`     | `com.pamisu.choosr`     | `Choosr-Prod` | `prod`         |

Development and UAT install alongside production and have visibly different device labels.
Each identity must be registered independently with Apple, Firebase, and Google Play.

## GitHub Actions

| Workflow              | Trigger                                    | Effect                                                           |
| --------------------- | ------------------------------------------ | ---------------------------------------------------------------- |
| `ci.yml`              | PR or push involving an environment branch | Formatting, lint, types, Jest, pgTAP, schema lint, Android build |
| `ios-ci.yml`          | iOS/application PR changes or manual       | Unsigned production simulator build                              |
| `supabase-deploy.yml` | Push to `dev`, `uat`, or `main`            | Guarded migration and Edge Function deployment                   |
| `mobile-build.yml`    | Push to `dev`, `uat`, or `main`            | Guarded signed Android/iOS artifacts and optional iOS upload     |

Deployment workflows are intentionally fail-closed. They do not deploy or build signed
artifacts until the matching GitHub environment sets the enable variable to `true`.

## GitHub environment configuration

Create `dev`, `uat`, and `prod` GitHub environments. Configure these independently.

### Variables

| Variable                          | Purpose                                           |
| --------------------------------- | ------------------------------------------------- |
| `SUPABASE_DEPLOY_ENABLED`         | Set to `true` only after the target is verified   |
| `SUPABASE_PROJECT_REF`            | Environment-specific Supabase project reference   |
| `SUPABASE_URL`                    | Mobile-safe environment API URL                   |
| `SUPABASE_PUBLISHABLE_KEY`        | Mobile-safe publishable key                       |
| `MOBILE_BUILD_ENABLED`            | Enables signed native artifacts                   |
| `MOBILE_UPLOAD_ENABLED`           | Enables App Store Connect upload after iOS export |
| `IOS_TEAM_ID`                     | Apple Developer team ID                           |
| `APP_STORE_CONNECT_API_KEY_ID`    | App Store Connect API key ID                      |
| `APP_STORE_CONNECT_API_ISSUER_ID` | App Store Connect API issuer ID                   |

### Secrets

| Secret                                     | Purpose                                           |
| ------------------------------------------ | ------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN`                    | CLI authentication; scope and rotate deliberately |
| `SUPABASE_DB_PASSWORD`                     | Database migration connection                     |
| `FIREBASE_ANDROID_CONFIG_BASE64`           | Base64 environment `google-services.json`         |
| `FIREBASE_IOS_CONFIG_BASE64`               | Base64 environment `GoogleService-Info.plist`     |
| `ANDROID_UPLOAD_KEYSTORE_BASE64`           | Android upload keystore                           |
| `ANDROID_UPLOAD_KEYSTORE_PASSWORD`         | Keystore password                                 |
| `ANDROID_UPLOAD_KEY_ALIAS`                 | Upload alias                                      |
| `ANDROID_UPLOAD_KEY_PASSWORD`              | Upload key password                               |
| `IOS_DISTRIBUTION_CERTIFICATE_P12_BASE64`  | Apple distribution certificate and key            |
| `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD`    | `.p12` password                                   |
| `IOS_PROVISIONING_PROFILE_BASE64`          | Profile matching the environment bundle ID        |
| `APP_STORE_CONNECT_API_PRIVATE_KEY_BASE64` | App Store Connect `.p8` key                       |

Provider and notification-worker server credentials remain Supabase project secrets. They do
not belong in GitHub unless a future audited workflow explicitly needs to rotate them.

## Environment provisioning checklist

For each environment:

1. Create an isolated Supabase project without production data.
2. Enable anonymous Auth and required Realtime publication through versioned configuration.
3. Create an isolated Firebase project and matching iOS/Android applications.
4. Add the appropriate APNs key to Firebase.
5. Store the Firebase Admin service account in that environment's Supabase secrets.
6. Configure provider secrets and deploy both Edge Functions.
7. Register the Apple identifier and provisioning profile.
8. Register the Google Play application where applicable.
9. Configure GitHub values with deployment gates still disabled.
10. Run CI, perform a dry run, enable deployment, then run deployment manually.

Never point a lower-environment binary at the production backend. Never copy production user
rows, profile photos, push tokens, or room data into a lower environment.

## Promotion

1. Merge a reviewed feature PR into `dev`.
2. Verify the development deployment and physical-device smoke test.
3. Open `dev -> uat`; require CI and resolve conflicts in the source branch.
4. Run the UAT acceptance checklist against the UAT build and backend.
5. Open `uat -> prod`; perform final release review without deploying production.
6. Open `prod -> main`; merge only the exact approved commit set.
7. Production workflows deploy and create store candidates from `main`.
8. Release publicly through the store consoles only after production smoke tests.

## Rollback

Database migrations are forward-only. Never rewrite or delete an applied migration. A schema
rollback is a new compensating migration reviewed and promoted through the normal path.

For application regressions:

1. Stop the store rollout or retain the previous store release.
2. Create a fix branch from `main`.
3. Reproduce and test the repair.
4. Promote it through the environment branches, using expedited approvals only when justified.
5. Release the repaired commit and reconcile all branches.

Every deployment record should identify the Git SHA, environment, native version/build number,
and latest Supabase migration.
