import { fetchWithTimeout } from './http.ts';

export async function isAuthenticated(authorization: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const publishableKey =
    Deno.env.get('SUPABASE_ANON_KEY') ??
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  if (!supabaseUrl || !publishableKey) {
    return false;
  }
  const response = await fetchWithTimeout(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: publishableKey },
  });
  return response.ok;
}
