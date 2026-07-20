# Choosr deployment and pipeline model

Choosr uses the same controlled promotion model as Sanctuary:

```text
feature/* -> dev -> uat -> prod -> main
```

`prod` is the final release-candidate branch. `main` is the released production source of
truth and the only branch allowed to deploy the production backend or produce a production
store candidate.

## Branch responsibilities

| Branch               | Responsibility                 | Runtime target                                  |
| -------------------- | ------------------------------ | ----------------------------------------------- |
| `feature/*`, `fix/*` | Isolated engineering work      | Local services only                             |
| `dev`                | Integrated development         | Local Supabase, development Firebase, CI        |
| `uat`                | Acceptance candidate           | Hosted UAT and Firebase App Distribution        |
| `prod`               | Final release-candidate review | Validation only; no production deployment       |
| `main`               | Released source of truth       | Production backend and private store candidates |

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
Each identity is registered with Apple and its matching Firebase project. Only
`com.pamisu.choosr` receives public App Store Connect and Google Play application records.

## Zero-cost environment topology

| Environment | Supabase                      | Firebase                  | Distribution                              |
| ----------- | ----------------------------- | ------------------------- | ----------------------------------------- |
| Development | Local Supabase CLI            | `choosr-dev`              | Xcode/Android Studio on developer devices |
| UAT         | Existing hosted free project  | Existing project as UAT   | Firebase App Distribution                 |
| Production  | New clean hosted free project | New `choosr-prod` project | TestFlight and Google Play internal       |

Supabase Free allows two active hosted projects, so development stays local. Production data,
auth identities, storage, room state, and push tokens must never share the UAT project. Firebase
uses a separate project per environment so test push traffic and service accounts cannot affect
production.

## GitHub Actions

| Workflow              | Trigger                                    | Effect                                                           |
| --------------------- | ------------------------------------------ | ---------------------------------------------------------------- |
| `ci.yml`              | PR or push involving an environment branch | Formatting, lint, types, Jest, pgTAP, schema lint, Android build |
| `ios-ci.yml`          | iOS/application PR changes or manual       | Unsigned production simulator build                              |
| `supabase-deploy.yml` | Push to `uat` or `main`                    | Guarded UAT/production migrations and Edge Functions             |
| `mobile-build.yml`    | Push to `uat` or `main`                    | UAT tester distribution or production store-candidate upload     |

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
| `FIREBASE_DISTRIBUTION_ENABLED`   | Enables UAT tester distribution                   |
| `FIREBASE_ANDROID_APP_ID`         | UAT Android Firebase App ID                       |
| `FIREBASE_IOS_APP_ID`             | UAT Apple Firebase App ID                         |
| `FIREBASE_TESTER_GROUPS`          | Comma-separated Firebase tester group aliases     |
| `FIREBASE_TESTER_EMAILS`          | Optional comma-separated tester emails            |
| `ANDROID_UPLOAD_ENABLED`          | Enables Google Play upload after Android build    |
| `IOS_UPLOAD_ENABLED`              | Enables App Store Connect upload after iOS export |
| `APP_VERSION`                     | Store-facing semantic version, such as `1.0.0`    |
| `GOOGLE_PLAY_PACKAGE_NAME`        | Package registered for that environment           |
| `GOOGLE_PLAY_TRACK`               | `internal`, `beta`, or `production`               |
| `GOOGLE_PLAY_RELEASE_STATUS`      | Internal testing uses `completed`                 |
| `IOS_TEAM_ID`                     | Apple Developer team ID                           |
| `APP_STORE_CONNECT_API_KEY_ID`    | App Store Connect API key ID                      |
| `APP_STORE_CONNECT_API_ISSUER_ID` | App Store Connect API issuer ID                   |

### Secrets

| Secret                                         | Purpose                                           |
| ---------------------------------------------- | ------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN`                        | CLI authentication; scope and rotate deliberately |
| `SUPABASE_DB_PASSWORD`                         | Database migration connection                     |
| `FIREBASE_ANDROID_CONFIG_BASE64`               | Base64 environment `google-services.json`         |
| `FIREBASE_IOS_CONFIG_BASE64`                   | Base64 environment `GoogleService-Info.plist`     |
| `FIREBASE_DISTRIBUTION_SERVICE_ACCOUNT_BASE64` | Firebase App Distribution service-account JSON    |
| `ANDROID_UPLOAD_KEYSTORE_BASE64`               | Android upload keystore                           |
| `ANDROID_UPLOAD_KEYSTORE_PASSWORD`             | Keystore password                                 |
| `ANDROID_UPLOAD_KEY_ALIAS`                     | Upload alias                                      |
| `ANDROID_UPLOAD_KEY_PASSWORD`                  | Upload key password                               |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_BASE64`           | Play Publisher service-account JSON               |
| `IOS_DISTRIBUTION_CERTIFICATE_P12_BASE64`      | Apple distribution certificate and key            |
| `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD`        | `.p12` password                                   |
| `IOS_PROVISIONING_PROFILE_BASE64`              | Profile matching the environment bundle ID        |
| `APP_STORE_CONNECT_API_PRIVATE_KEY_BASE64`     | App Store Connect `.p8` key                       |

Provider and notification-worker server credentials remain Supabase project secrets. They do
not belong in GitHub unless a future audited workflow explicitly needs to rotate them.

## Initial provisioning runbook

Perform these stages in order. Keep every deployment gate `false` until its stage is verified.

### 1. Development

1. Run Supabase locally with `npm run supabase:start` and rebuild it with
   `npm run supabase:reset`.
   Configure local push delivery with `npm run supabase:push:configure`, then keep
   `npm run supabase:functions:serve` running during two-device testing.
2. Create Firebase project `choosr-dev` on the Spark plan.
3. Register Android app `com.pamisu.choosr.dev` and Apple app
   `com.pamisu.choosr.dev`.
4. Place their downloaded configuration files at
   `android/app/src/dev/google-services.json` and
   `ios/Choosr/Firebase/dev/GoogleService-Info.plist`. These files remain ignored.
5. Register the Apple development App ID with Push Notifications, then use automatic Xcode
   development signing for local devices.
6. Run `npm run android:dev` and `npm run ios:dev`. The `dev` branch runs CI but never deploys
   a hosted backend or distributes a signed release.
7. For physical devices, set `.env.dev` to the Mac's private Wi-Fi address on port `54321`;
   simulators may use `127.0.0.1`. Never use a private HTTP URL for UAT or Production.

### 2. UAT

1. Rename the current hosted Supabase project display name to `choosr-uat`; its project ref does
   not change.
2. Apply all migrations, enable anonymous authentication, and configure the provider and
   notification worker secrets.
3. Treat the current Firebase project as UAT. Register Android and Apple apps using
   `com.pamisu.choosr.uat`, upload the APNs key, and download both configuration files.
4. Enable Firebase App Distribution and create tester group alias `uat-testers`.
5. Create a dedicated service account with Firebase App Distribution Admin access. Store its
   JSON only in the GitHub `uat` environment.
6. Register Apple App ID `com.pamisu.choosr.uat`, enable Push Notifications, register tester
   device UDIDs, and create an Ad Hoc provisioning profile. An Ad Hoc IPA can be installed from
   Firebase App Distribution; an App Store profile cannot.
7. Create a UAT Android signing keystore distinct from the production upload key.
8. Configure the GitHub `uat` variables and secrets listed below. Enable signed builds first,
   verify both artifacts, and only then enable Firebase distribution.

### 3. Production

1. Create a new clean hosted Supabase project named `choosr-prod`. Do not clone UAT rows or
   storage objects.
2. Deploy the migration history and Edge Functions, then configure fresh production provider
   and Firebase Admin credentials.
3. Create Firebase project `choosr-prod`, mark it as Production, and register Android and Apple
   apps using `com.pamisu.choosr`.
4. Upload the APNs authentication key and download fresh production Firebase configuration
   files.
5. In Apple Developer, retain the registered production App ID, create an App Store distribution
   profile, and export the distribution certificate plus private key as a password-protected
   `.p12`.
6. Create the production App Store Connect record and a dedicated App Store Connect API key.
   The App Store Connect key is not the APNs key.
7. Create the production Google Play record, enroll in Play App Signing, and preserve a distinct
   upload keystore. Create a dedicated Play Publisher service account with release-to-testing
   permission.
8. Configure the GitHub `prod` values. Enable production builds, verify signed artifacts, and
   then enable store uploads. Google Play receives an internal-testing release; App Store
   Connect receives a TestFlight candidate. Neither action is a public release.

### 4. GitHub activation

The `uat` environment requires the UAT Supabase variables, both Firebase app configurations,
the App Distribution service account, UAT Android signing material, and UAT Apple Ad Hoc
signing material. Set:

```text
SUPABASE_DEPLOY_ENABLED=true
MOBILE_BUILD_ENABLED=true
FIREBASE_DISTRIBUTION_ENABLED=true
ANDROID_UPLOAD_ENABLED=false
IOS_UPLOAD_ENABLED=false
FIREBASE_TESTER_GROUPS=uat-testers
```

The `prod` environment requires the clean production Supabase values, production Firebase
configs, Android Play upload signing, Apple App Store signing, and both store API credentials.
Set:

```text
SUPABASE_DEPLOY_ENABLED=true
MOBILE_BUILD_ENABLED=true
FIREBASE_DISTRIBUTION_ENABLED=false
ANDROID_UPLOAD_ENABLED=true
IOS_UPLOAD_ENABLED=true
GOOGLE_PLAY_PACKAGE_NAME=com.pamisu.choosr
GOOGLE_PLAY_TRACK=internal
GOOGLE_PLAY_RELEASE_STATUS=completed
```

Enable each line only after its credentials have been installed and verified. GitHub Actions
build number is used as Android `versionCode` and iOS `CFBundleVersion`; `APP_VERSION` controls
the human-readable store version.

## Hosted environment provisioning checklist

For UAT and production:

1. Create an isolated Supabase project without production data.
2. Enable anonymous Auth and required Realtime publication through versioned configuration.
3. Create an isolated Firebase project and matching iOS/Android applications.
4. Add the appropriate APNs key to Firebase.
5. Store the Firebase Admin service account in that environment's Supabase secrets.
6. Configure provider secrets and deploy both Edge Functions.
7. Register the Apple identifier and provisioning profile.
8. Register only the production application in App Store Connect and Google Play.
9. Configure GitHub values with deployment gates still disabled.
10. Run CI, perform a dry run, enable deployment, then run deployment manually.

The workflow assigns `github.run_number` as both platforms' monotonic store build number.
`APP_VERSION` remains the human-facing version. Android upload opens a Google Play edit,
uploads the signed bundle, and commits it to the private internal-testing track. iOS upload
sends the IPA to App Store Connect for TestFlight processing. Promotion from either private
channel to a public store release remains a separate manual decision.

Recommended environment mappings:

| Environment | Delivery target                    | Release status          |
| ----------- | ---------------------------------- | ----------------------- |
| `dev`       | Local physical devices             | Developer-controlled    |
| `uat`       | Firebase group `uat-testers`       | Private tester build    |
| `prod`      | Play `internal` and iOS TestFlight | Private store candidate |

Never point a lower-environment binary at the production backend. Never copy production user
rows, profile photos, push tokens, or room data into a lower environment.

## Promotion

1. Merge a reviewed feature PR into `dev`.
2. Verify local development and its physical-device smoke test.
3. Open `dev -> uat`; require CI and resolve conflicts in the source branch.
4. Run the UAT acceptance checklist against the UAT build and backend.
5. Open `uat -> prod`; perform final release review without deploying production.
6. Open `prod -> main`; merge only the exact approved commit set.
7. Production workflows deploy and create store candidates from `main`.
8. Release publicly through the store consoles only after production smoke tests.

The GitHub repository remains private. GitHub Actions, environments, encrypted secrets, and
store delivery all work with a private repository. On GitHub Free, protected-branch rules for
private repositories require a paid plan; making proprietary source public is not an
acceptable substitute. Until that feature is enabled, promotion discipline and environment
deployment gates are procedural rather than enforced branch policy.

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
