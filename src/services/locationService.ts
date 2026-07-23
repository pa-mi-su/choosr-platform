import { supabase } from '../lib/supabase';
import { ensureAnonymousSession } from './anonymousAuth';

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
  if (normalized.length < 3) return [];

  await ensureAnonymousSession();
  const { data, error } = await supabase.functions.invoke('search-locations', {
    body: { query: normalized },
  });
  if (error) throw error;
  return parseLocationSuggestions(data);
}
