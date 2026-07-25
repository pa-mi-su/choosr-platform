import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('notification dispatch contract', () => {
  const source = readFileSync(
    resolve(__dirname, '../supabase/functions/dispatch-notifications/index.ts'),
    'utf8',
  );

  test('uses immediate visible APNs alert delivery for room invitations', () => {
    expect(source).toContain("'apns-push-type': 'alert'");
    expect(source).toContain("'apns-priority': '10'");
    expect(source).toContain("sound: 'default'");
  });

  test('keeps private chat push copy generic', () => {
    expect(source).toContain("title: 'New private Choosr message'");
    expect(source).toContain("body: 'Open Choosr to view it privately.'");
  });
});
