import { createReadStream, existsSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { google } from 'googleapis';

const requiredEnvironment = [
  'GOOGLE_APPLICATION_CREDENTIALS',
  'FIREBASE_APP_ID',
  'FIREBASE_BINARY_PATH',
];

for (const name of requiredEnvironment) {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const appId = process.env.FIREBASE_APP_ID;
const binaryPath = process.env.FIREBASE_BINARY_PATH;
const releaseNotes = process.env.FIREBASE_RELEASE_NOTES ?? 'Automated CI build';
const groupAliases = splitList(process.env.FIREBASE_TESTER_GROUPS);
const testerEmails = splitList(process.env.FIREBASE_TESTER_EMAILS);

if (!existsSync(credentialsPath)) {
  throw new Error(`Firebase credentials file not found: ${credentialsPath}`);
}

if (!existsSync(binaryPath)) {
  throw new Error(`Firebase distribution binary not found: ${binaryPath}`);
}

if (groupAliases.length === 0 && testerEmails.length === 0) {
  throw new Error(
    'Set FIREBASE_TESTER_GROUPS or FIREBASE_TESTER_EMAILS before distribution.',
  );
}

const appIdParts = appId.split(':');
if (appIdParts.length < 4 || !appIdParts[1]) {
  throw new Error(`Invalid Firebase App ID: ${appId}`);
}

const appResource = `projects/${appIdParts[1]}/apps/${appId}`;
const auth = new google.auth.GoogleAuth({
  keyFile: credentialsPath,
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});
const client = await auth.getClient();

const upload = await client.request({
  url: `https://firebaseappdistribution.googleapis.com/upload/v1/${appResource}/releases:upload`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(statSync(binaryPath).size),
    'X-Goog-Upload-Protocol': 'raw',
    'X-Goog-Upload-File-Name': basename(binaryPath),
  },
  data: createReadStream(binaryPath),
});

let operation = upload.data;
for (let attempt = 0; !operation.done && attempt < 60; attempt += 1) {
  await delay(2000);
  const response = await client.request({
    url: `https://firebaseappdistribution.googleapis.com/v1/${operation.name}`,
  });
  operation = response.data;
}

if (!operation.done) {
  throw new Error('Firebase App Distribution upload did not finish in time.');
}

if (operation.error) {
  throw new Error(
    `Firebase App Distribution upload failed: ${operation.error.message}`,
  );
}

const release = operation.response?.release;
if (!release?.name) {
  throw new Error('Firebase App Distribution did not return a release.');
}

await client.request({
  url: `https://firebaseappdistribution.googleapis.com/v1/${release.name}?updateMask=releaseNotes.text`,
  method: 'PATCH',
  data: {
    name: release.name,
    releaseNotes: { text: releaseNotes },
  },
});

await client.request({
  url: `https://firebaseappdistribution.googleapis.com/v1/${release.name}:distribute`,
  method: 'POST',
  data: { groupAliases, testerEmails },
});

console.log(`Distributed ${release.name} to the configured Firebase testers.`);

function splitList(value) {
  return (value ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}
