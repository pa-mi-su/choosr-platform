import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const trackedFiles = execFileSync('git', ['ls-files', '-z'])
  .toString('utf8')
  .split('\0')
  .filter(Boolean);

const forbiddenNames = [
  /^AuthKey_.+\.p8$/i,
  /firebase-adminsdk.*\.json$/i,
  /service-account.*\.json$/i,
  /\.jks$/i,
  /\.keystore$/i,
  /\.p12$/i,
  /\.mobileprovision$/i,
];

const forbiddenContent = [
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
  /"private_key"\s*:\s*"-----BEGIN PRIVATE KEY/,
  /\bsb_secret_[A-Za-z0-9_-]+/,
  /^(?:EDGE_RATE_LIMIT_HMAC_SECRET|STORAGE_CLEANUP_TOKEN|GEOAPIFY_API_KEY|GOOGLE_PLACES_API_KEY|FIREBASE_SERVICE_ACCOUNT_BASE64|SUPABASE_DB_PASSWORD|SUPABASE_ACCESS_TOKEN)=[^\s.][^\s]{7,}$/m,
];

const violations = [];
for (const file of trackedFiles) {
  if (forbiddenNames.some(pattern => pattern.test(basename(file)))) {
    violations.push(`${file}: forbidden credential filename`);
    continue;
  }

  let contents;
  try {
    contents = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (forbiddenContent.some(pattern => pattern.test(contents))) {
    violations.push(`${file}: credential-like content`);
  }
}

if (violations.length > 0) {
  console.error('Committed secret verification failed:');
  violations.forEach(violation => console.error(`- ${violation}`));
  process.exit(1);
}

console.log('No committed credential files or secret values detected.');
