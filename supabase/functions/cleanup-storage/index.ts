import { serviceClient } from '../_shared/security.ts';

const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

async function tokenMatches(
  expected: string,
  supplied: string,
): Promise<boolean> {
  const encode = (value: string) => new TextEncoder().encode(value);
  const [expectedDigest, suppliedDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encode(expected)),
    crypto.subtle.digest('SHA-256', encode(supplied)),
  ]);
  const left = new Uint8Array(expectedDigest);
  const right = new Uint8Array(suppliedDigest);
  let difference = left.length ^ right.length;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ (right[index] ?? 0);
  }
  return difference === 0;
}

Deno.serve(async request => {
  if (request.method !== 'POST') {
    return response({ error: 'Method not allowed.' }, 405);
  }
  const expectedToken = Deno.env.get('STORAGE_CLEANUP_TOKEN');
  const suppliedToken = request.headers.get('x-choosr-job-token') ?? '';
  if (
    !expectedToken ||
    expectedToken.length < 64 ||
    !(await tokenMatches(expectedToken, suppliedToken))
  ) {
    return response({ error: 'Authentication required.' }, 401);
  }

  try {
    const service = serviceClient();
    const { data, error } = await service.rpc(
      'list_storage_cleanup_candidates',
      { p_limit: 500 },
    );
    if (error) throw error;

    const candidates = (Array.isArray(data) ? data : []) as Array<{
      bucket_id: string;
      object_name: string;
    }>;
    let deleted = 0;
    for (const bucket of ['profile-photos', 'decision-photos']) {
      const paths = candidates
        .filter(candidate => candidate.bucket_id === bucket)
        .map(candidate => candidate.object_name);
      if (!paths.length) continue;
      const { data: removed, error: removeError } = await service.storage
        .from(bucket)
        .remove(paths);
      if (removeError) throw removeError;
      deleted += removed?.length ?? 0;
    }
    console.info(
      JSON.stringify({
        event: 'storage_cleanup_completed',
        considered: candidates.length,
        deleted,
      }),
    );
    return response({ considered: candidates.length, deleted });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'storage_cleanup_failed',
        code: error instanceof Error ? error.name : 'unknown',
      }),
    );
    return response({ error: 'Storage cleanup failed.' }, 503);
  }
});
