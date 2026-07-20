import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const credentialPath =
  process.env.CHOOSR_FIREBASE_SERVICE_ACCOUNT_PATH ||
  resolve(
    homedir(),
    '.config/choosr/credentials/choosr-dev-firebase-admin.json',
  );
const outputPath = resolve(projectRoot, 'supabase/.env.local');

const credentialContents = await readFile(credentialPath, 'utf8');
const credential = JSON.parse(credentialContents);

if (credential.type !== 'service_account') {
  throw new Error('Firebase credential must be a service-account JSON file.');
}

if (credential.project_id !== 'choosr-dev') {
  throw new Error(
    `Expected the choosr-dev Firebase credential, received ${
      credential.project_id || 'an unknown project'
    }.`,
  );
}

const encodedCredential = Buffer.from(credentialContents).toString('base64');

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `FIREBASE_SERVICE_ACCOUNT_BASE64=${encodedCredential}\n`,
  { mode: 0o600 },
);
await chmod(outputPath, 0o600);

console.log('Configured the ignored local Choosr Dev push environment.');
