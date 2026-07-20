import { createReadStream, existsSync } from 'node:fs';
import { google } from 'googleapis';

const requiredEnvironment = [
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GOOGLE_PLAY_PACKAGE_NAME',
  'GOOGLE_PLAY_BUNDLE_PATH',
  'GOOGLE_PLAY_TRACK',
];

for (const name of requiredEnvironment) {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME;
const bundlePath = process.env.GOOGLE_PLAY_BUNDLE_PATH;
const track = process.env.GOOGLE_PLAY_TRACK;
const status = process.env.GOOGLE_PLAY_RELEASE_STATUS ?? 'draft';
const releaseName =
  process.env.GOOGLE_PLAY_RELEASE_NAME ??
  `Choosr ${process.env.GITHUB_SHA?.slice(0, 7) ?? 'manual'}`;

if (!existsSync(credentialsPath)) {
  throw new Error(`Google Play credentials file not found: ${credentialsPath}`);
}

if (!existsSync(bundlePath)) {
  throw new Error(`Android App Bundle not found: ${bundlePath}`);
}

const supportedStatuses = new Set([
  'completed',
  'draft',
  'halted',
  'inProgress',
]);
if (!supportedStatuses.has(status)) {
  throw new Error(`Unsupported Google Play release status: ${status}`);
}

const auth = new google.auth.GoogleAuth({
  keyFile: credentialsPath,
  scopes: ['https://www.googleapis.com/auth/androidpublisher'],
});
const publisher = google.androidpublisher({ version: 'v3', auth });

const edit = await publisher.edits.insert({ packageName });
const editId = edit.data.id;
if (!editId) {
  throw new Error('Google Play did not return an edit ID.');
}

try {
  const uploaded = await publisher.edits.bundles.upload({
    packageName,
    editId,
    media: {
      mimeType: 'application/octet-stream',
      body: createReadStream(bundlePath),
    },
  });
  const versionCode = uploaded.data.versionCode;
  if (!versionCode) {
    throw new Error('Google Play did not return the uploaded version code.');
  }

  await publisher.edits.tracks.update({
    packageName,
    editId,
    track,
    requestBody: {
      track,
      releases: [
        {
          name: releaseName,
          status,
          versionCodes: [String(versionCode)],
        },
      ],
    },
  });
  await publisher.edits.commit({ packageName, editId });
  console.log(
    `Uploaded ${packageName} version ${versionCode} to ${track} with status ${status}.`,
  );
} catch (error) {
  await publisher.edits.delete({ packageName, editId }).catch(() => undefined);
  throw error;
}
