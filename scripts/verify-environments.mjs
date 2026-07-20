import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

async function requireText(path, patterns) {
  const contents = await readFile(resolve(root, path), 'utf8');
  for (const pattern of patterns) {
    if (!pattern.test(contents)) {
      throw new Error(`${path} is missing required configuration: ${pattern}`);
    }
  }
}

await requireText('android/app/build.gradle', [
  /applicationIdSuffix "\.dev"/,
  /applicationIdSuffix "\.uat"/,
  /productFlavors/,
]);

await requireText('ios/Choosr.xcodeproj/project.pbxproj', [
  /com\.pamisu\.choosr\.dev/,
  /com\.pamisu\.choosr\.uat/,
  /CHOOSR_ENV = dev/,
  /CHOOSR_ENV = uat/,
  /CHOOSR_ENV = prod/,
]);

for (const scheme of ['Choosr-Dev', 'Choosr-UAT', 'Choosr-Prod']) {
  await requireText(
    `ios/Choosr.xcodeproj/xcshareddata/xcschemes/${scheme}.xcscheme`,
    [/<Scheme/],
  );
}

console.log(
  'Choosr dev, UAT, and production configurations are structurally valid.',
);
