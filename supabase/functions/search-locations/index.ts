import { authenticatedUserId } from '../build-deck/auth.ts';
import { fetchWithTimeout, jsonResponse } from '../build-deck/http.ts';
import {
  cacheKey,
  enforceEdgeRateLimits,
  getCachedJson,
  putCachedJson,
} from '../_shared/security.ts';

type GeoapifyLocation = {
  place_id?: string;
  formatted?: string;
  name?: string;
  city?: string;
  county?: string;
  state?: string;
  state_code?: string;
  postcode?: string;
  country_code?: string;
  lat?: number;
  lon?: number;
};

type LocationSuggestion = {
  id: string;
  label: string;
  city: string;
  region: string;
  postalCode?: string;
  countryCode: 'US' | 'CA';
  latitude: number;
  longitude: number;
};

const cleanRegion = (location: GeoapifyLocation) =>
  location.state_code?.split('-').at(-1) ?? location.state ?? '';

function toSuggestion(
  location: GeoapifyLocation,
): LocationSuggestion | undefined {
  const countryCode = location.country_code?.toUpperCase();
  const city = location.city ?? location.name ?? location.county;
  const region = cleanRegion(location);
  if (
    (countryCode !== 'US' && countryCode !== 'CA') ||
    !city ||
    !Number.isFinite(location.lat) ||
    !Number.isFinite(location.lon)
  ) {
    return undefined;
  }

  const locality = [region, location.postcode].filter(Boolean).join(' ');
  const label = [city, locality].filter(Boolean).join(', ');
  return {
    id:
      location.place_id ??
      `${countryCode}:${location.lat}:${location.lon}:${label}`,
    label: label || location.formatted || city,
    city,
    region,
    ...(location.postcode ? { postalCode: location.postcode } : {}),
    countryCode,
    latitude: location.lat as number,
    longitude: location.lon as number,
  };
}

Deno.serve(async request => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Authentication required.' }, 401);
  }
  let userId: string | undefined;
  try {
    userId = await authenticatedUserId(authorization);
  } catch {
    return jsonResponse({ error: 'Authentication service unavailable.' }, 503);
  }
  if (!userId) {
    return jsonResponse({ error: 'Invalid authentication token.' }, 401);
  }

  let query: string;
  try {
    const body = (await request.json()) as { query?: unknown };
    query = typeof body.query === 'string' ? body.query.trim() : '';
  } catch {
    return jsonResponse({ error: 'Request body must be valid JSON.' }, 400);
  }
  if (query.length < 3 || query.length > 80) {
    return jsonResponse(
      { error: 'Enter at least 3 characters of a city or ZIP.' },
      400,
    );
  }

  let service;
  try {
    const rateLimit = await enforceEdgeRateLimits({
      request,
      userId,
      user: { action: 'location_search_user', limit: 30, windowSeconds: 600 },
      ip: { action: 'location_search_ip', limit: 90, windowSeconds: 600 },
    });
    if (!rateLimit.accountAllowed) {
      return jsonResponse({ error: 'Account is unavailable.' }, 403);
    }
    if (!rateLimit.allowed) {
      return jsonResponse(
        { error: 'Too many searches. Try again in a few minutes.' },
        429,
      );
    }
    service = rateLimit.service;
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'location_security_boundary_failed',
        code: error instanceof Error ? error.name : 'unknown',
      }),
    );
    return jsonResponse({ error: 'Location search is unavailable.' }, 503);
  }

  const apiKey = Deno.env.get('GEOAPIFY_API_KEY');
  if (!apiKey) {
    return jsonResponse({ error: 'Location search is unavailable.' }, 503);
  }

  try {
    const normalizedQuery = query
      .toLocaleLowerCase('en-US')
      .replace(/\s+/g, ' ');
    const responseCacheKey = await cacheKey('location-v1', normalizedQuery);
    const cached = await getCachedJson<{ locations: LocationSuggestion[] }>(
      service,
      responseCacheKey,
    );
    if (cached) return jsonResponse(cached);

    const parameters = new URLSearchParams({
      text: query,
      format: 'json',
      lang: 'en',
      limit: '8',
      filter: 'countrycode:us,ca',
      apiKey,
    });
    const response = await fetchWithTimeout(
      `https://api.geoapify.com/v1/geocode/autocomplete?${parameters}`,
      {},
      6000,
    );
    if (!response.ok) {
      throw new Error(`Location lookup failed with ${response.status}.`);
    }
    const payload = (await response.json()) as {
      results?: GeoapifyLocation[];
    };
    const seen = new Set<string>();
    const locations = (payload.results ?? [])
      .map(toSuggestion)
      .filter((location): location is LocationSuggestion => {
        if (!location || seen.has(location.label)) return false;
        seen.add(location.label);
        return true;
      })
      .slice(0, 5);
    const result = { locations };
    await putCachedJson(service, responseCacheKey, result, 3600);
    return jsonResponse(result);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'location_search_failed',
        code: error instanceof Error ? error.name : 'unknown',
      }),
    );
    return jsonResponse({ error: 'Location search is unavailable.' }, 503);
  }
});
