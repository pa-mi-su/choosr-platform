import {
  createClient,
  type SupabaseClient,
} from 'npm:@supabase/supabase-js@2.110.7';

type RateLimit = {
  action: string;
  limit: number;
  windowSeconds: number;
};

export class SecurityConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityConfigurationError';
  }
}

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new SecurityConfigurationError(`Missing ${name}.`);
  }
  return value;
}

export function serviceClient(): SupabaseClient {
  return createClient(
    requiredEnvironment('SUPABASE_URL'),
    requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function clientAddress(request: Request): string {
  const forwarded = request.headers
    .get('x-forwarded-for')
    ?.split(',')[0]
    ?.trim();
  return (
    request.headers.get('cf-connecting-ip')?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    forwarded ||
    'unavailable'
  ).slice(0, 80);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSha256(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(signature))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function consume(
  service: SupabaseClient,
  actorKey: string,
  rateLimit: RateLimit,
): Promise<boolean> {
  const { data, error } = await service.rpc('consume_edge_rate_limit', {
    p_actor_key: actorKey,
    p_action: rateLimit.action,
    p_limit: rateLimit.limit,
    p_window_seconds: rateLimit.windowSeconds,
  });
  if (error) throw error;
  return data === true;
}

export async function enforceEdgeRateLimits(input: {
  request: Request;
  userId: string;
  user: RateLimit;
  ip: RateLimit;
  service?: SupabaseClient;
}): Promise<{
  allowed: boolean;
  accountAllowed: boolean;
  service: SupabaseClient;
}> {
  const service = input.service ?? serviceClient();
  const salt = requiredEnvironment('EDGE_RATE_LIMIT_HMAC_SECRET');
  const ipHash = await hmacSha256(salt, clientAddress(input.request));
  const [accountAllowed, userAllowed, ipAllowed] = await Promise.all([
    service
      .rpc('edge_account_is_active', { p_user_id: input.userId })
      .then(({ data, error }) => {
        if (error) throw error;
        return data === true;
      }),
    consume(service, `user:${input.userId}`, input.user),
    consume(service, `ip:${ipHash}`, input.ip),
  ]);
  return {
    allowed: accountAllowed && userAllowed && ipAllowed,
    accountAllowed,
    service,
  };
}

export async function cacheKey(
  namespace: string,
  value: string,
): Promise<string> {
  return `${namespace}:${await sha256(value)}`;
}

export async function getCachedJson<T>(
  service: SupabaseClient,
  key: string,
): Promise<T | undefined> {
  const { data, error } = await service.rpc('get_edge_cached_response', {
    p_cache_key: key,
  });
  if (error) throw error;
  return data == null ? undefined : (data as T);
}

export async function putCachedJson(
  service: SupabaseClient,
  key: string,
  payload: unknown,
  ttlSeconds: number,
): Promise<void> {
  const { error } = await service.rpc('put_edge_cached_response', {
    p_cache_key: key,
    p_payload: payload,
    p_ttl_seconds: ttlSeconds,
  });
  if (error) throw error;
}
