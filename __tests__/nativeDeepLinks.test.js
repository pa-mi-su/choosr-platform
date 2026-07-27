const { readFileSync } = require('fs');
const { resolve } = require('path');

describe('native private-chat URL delivery', () => {
  test('iOS forwards cold and warm custom URLs to React Native Linking', () => {
    const appDelegate = readFileSync(
      resolve(__dirname, '../ios/Choosr/AppDelegate.swift'),
      'utf8',
    );

    expect(appDelegate).toContain('import React');
    expect(appDelegate).toContain('open url: URL');
    expect(appDelegate).toContain('RCTLinkingManager.application(app');
  });

  test('Android accepts Chat links and retains warm-start intents', () => {
    const manifest = readFileSync(
      resolve(__dirname, '../android/app/src/main/AndroidManifest.xml'),
      'utf8',
    );
    const activity = readFileSync(
      resolve(
        __dirname,
        '../android/app/src/main/java/com/pamisu/choosr/MainActivity.kt',
      ),
      'utf8',
    );

    expect(manifest).toContain('android:launchMode="singleTask"');
    expect(manifest).toContain(
      '<data android:scheme="choosr" android:host="chat" />',
    );
    expect(activity).toContain('override fun onNewIntent(intent: Intent)');
    expect(activity).toContain('setIntent(intent)');
  });
});
