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
    expect(source).toContain("'apns-expiration'");
    expect(source).toContain("'apns-collapse-id'");
  });

  test('bounds Android delivery and uses one audible high-priority channel', () => {
    expect(source).toContain('ttl: `${secondsRemaining}s`');
    expect(source).toContain("channel_id: 'choosr-alerts-v2'");
    expect(source).toContain("sound: 'default'");
    expect(source).toContain('default_vibrate_timings: true');
    expect(source).toContain('tag: notificationTag');
  });

  test('revalidates claimed jobs immediately before provider delivery', () => {
    expect(source).toContain("'notification_job_is_deliverable'");
    expect(source).toContain("'discard_notification_job'");
    expect(source).toContain("'event_no_longer_current'");
    expect(source).toContain("'delivery_window_expired'");
  });

  test('sends matched-chat invitations to the private chat inbox', () => {
    expect(source).toContain("job.kind === 'chat_invitation'");
    expect(source).toContain("title: 'Private chat invitation'");
    expect(source).toContain('wants to start a private chat about your match.');
    expect(source).toContain("route: 'ChatHome'");
  });

  test('never dispatches a push for an individual private message', () => {
    expect(source).not.toContain("job.kind === 'chat_message'");
    expect(source).not.toContain("kind: 'chat_message'");
    expect(source).not.toContain("'New private Choosr message'");
  });

  test('retains invalid endpoint diagnostics instead of deleting the token', () => {
    expect(source).toContain('last_delivery_error: result.ok ? null');
    expect(source).toContain(
      'invalidated_at: result.invalidToken ? attemptedAt : null',
    );
    expect(source).not.toContain(
      ".from('device_push_tokens')\n                .delete()",
    );
  });
});
