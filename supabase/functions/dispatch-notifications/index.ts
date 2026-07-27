import { createClient } from 'npm:@supabase/supabase-js@2.110.7';
import { importPKCS8, SignJWT } from 'npm:jose@6.1.3';
import {
  buildServiceAccountClaims,
  readBearerAccessToken,
} from './googleAuth.ts';
import { normalizeFcmFailure } from './fcmError.ts';

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

type PushJob = {
  id: number;
  recipient_user_id: string;
  kind: 'connection_request' | 'room_invitation' | 'chat_message';
  payload: Record<string, unknown>;
  attempts: number;
};

type PushCopy = { title: string; body: string };

const jsonHeaders = { 'Content-Type': 'application/json' };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function reportSummary(summary: Record<string, number>) {
  console.info(
    JSON.stringify({ event: 'notification_dispatch_completed', ...summary }),
  );
  return jsonResponse(summary);
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function loadServiceAccount(): ServiceAccount {
  const encoded = requireEnv('FIREBASE_SERVICE_ACCOUNT_BASE64');
  const parsed = JSON.parse(atob(encoded)) as Partial<ServiceAccount>;
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error('Firebase service account is incomplete.');
  }
  return parsed as ServiceAccount;
}

async function getGoogleAccessToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const key = await importPKCS8(account.private_key, 'RS256');
  const assertion = await new SignJWT(buildServiceAccountClaims(account, now))
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .sign(key);

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(`Google OAuth failed (${response.status}).`);
  }
  return readBearerAccessToken(result);
}

function pushCopy(job: PushJob): PushCopy {
  if (job.kind === 'chat_message') {
    return {
      title: 'New private Choosr message',
      body: 'Open Choosr to view it privately.',
    };
  }
  if (job.kind === 'connection_request') {
    return {
      title: 'New Choosr connection',
      body: 'Someone wants to add you to their Circle.',
    };
  }
  const mode = typeof job.payload.mode === 'string' ? job.payload.mode : '';
  const activity =
    mode === 'eat' ? 'food' : mode === 'do' ? 'an activity' : 'a custom choice';
  return {
    title: "You're invited",
    body: `Open Choosr to choose ${activity} together.`,
  };
}

function stringData(job: PushJob): Record<string, string> {
  if (job.kind === 'chat_message') {
    return { kind: 'chat_message', route: 'Chat' };
  }
  const data: Record<string, string> = { kind: job.kind, route: 'Circle' };
  for (const key of ['connection_id', 'invitation_id', 'session_id', 'mode']) {
    const value = job.payload[key];
    if (typeof value === 'string') data[key] = value;
  }
  return data;
}

async function sendMessage(input: {
  account: ServiceAccount;
  accessToken: string;
  token: string;
  job: PushJob;
  unreadCount: number;
}): Promise<{ ok: boolean; invalidToken: boolean; error?: string }> {
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${input.account.project_id}/messages:send`,
    {
      method: 'POST',
      headers: {
        ...jsonHeaders,
        Authorization: `Bearer ${input.accessToken}`,
      },
      body: JSON.stringify({
        message: {
          token: input.token,
          notification: pushCopy(input.job),
          data: stringData(input.job),
          android: {
            priority: 'high',
            notification: { notification_count: input.unreadCount },
          },
          apns: {
            headers: {
              'apns-priority': '10',
              'apns-push-type': 'alert',
            },
            payload: { aps: { sound: 'default', badge: input.unreadCount } },
          },
        },
      }),
    },
  );
  if (response.ok) return { ok: true, invalidToken: false };

  const failure = normalizeFcmFailure(response.status, await response.text());
  return {
    ok: false,
    invalidToken: failure.invalidToken,
    error: failure.code,
  };
}

Deno.serve(async request => {
  if (request.method !== 'POST')
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  const hasBearerAuthorization = request.headers
    .get('Authorization')
    ?.startsWith('Bearer ');
  const hasProjectApiKey = Boolean(request.headers.get('apikey'));
  if (!hasBearerAuthorization && !hasProjectApiKey) {
    return jsonResponse({ error: 'Authentication required.' }, 401);
  }

  try {
    const supabaseUrl = requireEnv('SUPABASE_URL');
    const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    const account = loadServiceAccount();
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: jobs, error: claimError } = await supabase.rpc(
      'claim_notification_jobs',
      { p_limit: 25 },
    );
    if (claimError) throw claimError;
    if (!jobs?.length)
      return reportSummary({
        processed: 0,
        delivered: 0,
        failed: 0,
        recipientsWithoutDevices: 0,
        invalidTokensRemoved: 0,
      });

    const accessToken = await getGoogleAccessToken(account);
    let delivered = 0;
    let failed = 0;
    let recipientsWithoutDevices = 0;
    let invalidTokensRemoved = 0;
    for (const job of jobs as PushJob[]) {
      const { count: unreadCount, error: unreadError } = await supabase
        .from('user_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_user_id', job.recipient_user_id)
        .is('read_at', null)
        .is('deleted_at', null);
      if (unreadError) throw unreadError;
      const { data: knownDevices, error: deviceError } = await supabase
        .from('device_push_tokens')
        .select('id, token, invalidated_at, last_delivery_error')
        .eq('user_id', job.recipient_user_id);
      if (deviceError) throw deviceError;
      const devices =
        knownDevices?.filter(device => device.invalidated_at === null) ?? [];
      if (!devices?.length) {
        const retainedProviderErrors = [
          ...new Set(
            (knownDevices ?? [])
              .map(device => device.last_delivery_error)
              .filter((code): code is string => Boolean(code)),
          ),
        ];
        await supabase.rpc('fail_notification_job', {
          p_id: job.id,
          p_error: retainedProviderErrors.length
            ? `Recipient has no active device: ${retainedProviderErrors.join(
                ' | ',
              )}`
            : 'Recipient has no registered device.',
        });
        failed += 1;
        recipientsWithoutDevices += 1;
        continue;
      }

      const results = await Promise.all(
        devices.map(device =>
          sendMessage({
            account,
            accessToken,
            token: device.token,
            job,
            unreadCount: Math.max(unreadCount ?? 1, 1),
          }),
        ),
      );
      const attemptedAt = new Date().toISOString();
      const deviceUpdates = await Promise.all(
        devices.map((device, index) => {
          const result = results[index];
          return supabase
            .from('device_push_tokens')
            .update({
              last_delivery_attempt_at: attemptedAt,
              last_delivery_succeeded_at: result.ok ? attemptedAt : undefined,
              last_delivery_error: result.ok ? null : result.error ?? 'UNKNOWN',
              invalidated_at: result.invalidToken ? attemptedAt : null,
            })
            .eq('id', device.id);
        }),
      );
      const updateError = deviceUpdates.find(update => update.error)?.error;
      if (updateError) throw updateError;
      invalidTokensRemoved += results.filter(
        result => result.invalidToken,
      ).length;
      if (results.some(result => result.ok)) {
        await supabase.rpc('complete_notification_job', { p_id: job.id });
        delivered += 1;
      } else {
        await supabase.rpc('fail_notification_job', {
          p_id: job.id,
          p_error: results
            .map(result => result.error)
            .filter(Boolean)
            .join(' | '),
        });
        failed += 1;
      }
    }
    const summary = {
      processed: jobs.length,
      delivered,
      failed,
      recipientsWithoutDevices,
      invalidTokensRemoved,
    };
    return reportSummary(summary);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'notification_dispatch_failed',
        code: error instanceof Error ? error.name : 'unknown',
      }),
    );
    return jsonResponse(
      { error: 'Notification delivery is unavailable.' },
      503,
    );
  }
});
