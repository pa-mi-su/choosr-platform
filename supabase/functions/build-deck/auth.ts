import { fetchWithTimeout } from './http.ts';

type AuthenticatedUser = { id?: string };

export async function authenticatedUserId(authorization: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const publishableKey =
    Deno.env.get('SUPABASE_ANON_KEY') ??
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  if (!supabaseUrl || !publishableKey) {
    return undefined;
  }
  const response = await fetchWithTimeout(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: publishableKey },
  });
  if (!response.ok) return undefined;
  const user = (await response.json()) as AuthenticatedUser;
  return typeof user.id === 'string' ? user.id : undefined;
}

export async function isAuthenticated(authorization: string) {
  return Boolean(await authenticatedUserId(authorization));
}
