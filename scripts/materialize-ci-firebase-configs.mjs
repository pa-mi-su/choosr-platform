import { mkdir, writeFile } from 'node:fs/promises';

const androidPath = 'android/app/google-services.json';
const iosPath = 'ios/Choosr/GoogleService-Info.plist';

const androidConfig = {
  project_info: {
    project_number: '000000000000',
    project_id: 'choosr-ci',
    storage_bucket: 'choosr-ci.invalid',
  },
  client: [
    {
      client_info: {
        mobilesdk_app_id: '1:000000000000:android:0000000000000000000000',
        android_client_info: { package_name: 'com.pamisu.choosr' },
      },
      oauth_client: [],
      api_key: [{ current_key: 'ci-placeholder' }],
      services: { appinvite_service: { other_platform_oauth_client: [] } },
    },
  ],
  configuration_version: '1',
};

const iosConfig = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>API_KEY</key><string>ci-placeholder</string>
  <key>GCM_SENDER_ID</key><string>000000000000</string>
  <key>PLIST_VERSION</key><string>1</string>
  <key>BUNDLE_ID</key><string>com.pamisu.choosr</string>
  <key>PROJECT_ID</key><string>choosr-ci</string>
  <key>STORAGE_BUCKET</key><string>choosr-ci.invalid</string>
  <key>IS_ADS_ENABLED</key><false/>
  <key>IS_ANALYTICS_ENABLED</key><false/>
  <key>IS_APPINVITE_ENABLED</key><false/>
  <key>IS_GCM_ENABLED</key><true/>
  <key>IS_SIGNIN_ENABLED</key><false/>
  <key>GOOGLE_APP_ID</key><string>1:000000000000:ios:0000000000000000000000</string>
</dict>
</plist>
`;

await mkdir('android/app', { recursive: true });
await mkdir('ios/Choosr', { recursive: true });
await writeFile(androidPath, `${JSON.stringify(androidConfig, null, 2)}\n`, {
  mode: 0o600,
});
await writeFile(iosPath, iosConfig, { mode: 0o600 });

console.log(
  'Materialized non-production Firebase placeholders for CI compilation.',
);
