import { supabase } from '../lib/supabase';
import { ensureAnonymousSession } from './anonymousAuth';
import { withRequestTimeout } from './requestTimeout';

export type LocationSuggestion = {
  id: string;
  label: string;
  city: string;
  region: string;
  postalCode?: string;
  countryCode: 'US' | 'CA';
  latitude: number;
  longitude: number;
};

const LOCATION_REQUEST_TIMEOUT_MS = 10_000;
const LOCATION_CACHE_TTL_MS = 5 * 60 * 1_000;
const locationCache = new Map<
  string,
  { expiresAt: number; locations: LocationSuggestion[] }
>();
const pendingLocationSearches = new Map<
  string,
  Promise<LocationSuggestion[]>
>();

export function locationQueryHint(query: string): string | null {
  const normalized = query.trim();
  if (!normalized) return null;
  if (/^\d{1,4}$/.test(normalized)) {
    return 'Enter all 5 digits of the ZIP code.';
  }
  if (normalized.length < 3) {
    return 'Enter at least 3 characters.';
  }
  return null;
}

export function parseLocationSuggestions(value: unknown): LocationSuggestion[] {
  if (typeof value !== 'object' || value === null || !('locations' in value)) {
    return [];
  }
  const locations = (value as { locations?: unknown }).locations;
  if (!Array.isArray(locations)) return [];

  return locations.filter((location): location is LocationSuggestion => {
    if (typeof location !== 'object' || location === null) return false;
    const candidate = location as Partial<LocationSuggestion>;
    return (
      typeof candidate.id === 'string' &&
      typeof candidate.label === 'string' &&
      typeof candidate.city === 'string' &&
      typeof candidate.region === 'string' &&
      (candidate.countryCode === 'US' || candidate.countryCode === 'CA') &&
      typeof candidate.latitude === 'number' &&
      Number.isFinite(candidate.latitude) &&
      typeof candidate.longitude === 'number' &&
      Number.isFinite(candidate.longitude)
    );
  });
}

export async function searchLocations(
  query: string,
): Promise<LocationSuggestion[]> {
  const normalized = query.trim();
  if (!normalized || locationQueryHint(normalized)) return [];

  const cacheKey = normalized.toLocaleLowerCase('en-US');
  const cached = locationCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.locations;
  }

  const pending = pendingLocationSearches.get(cacheKey);
  if (pending) return pending;

  const request = (async () => {
    await ensureAnonymousSession();
    const { data, error } = await withRequestTimeout(
      supabase.functions.invoke('search-locations', {
        body: { query: normalized },
      }),
      LOCATION_REQUEST_TIMEOUT_MS,
      'Location search',
    );
    if (error) throw error;
    const locations = parseLocationSuggestions(data);
    locationCache.set(cacheKey, {
      expiresAt: Date.now() + LOCATION_CACHE_TTL_MS,
      locations,
    });
    return locations;
  })().finally(() => {
    pendingLocationSearches.delete(cacheKey);
  });
  pendingLocationSearches.set(cacheKey, request);
  return request;
}
