import { colorsFor } from '../presentation.ts';
import { fetchWithTimeout } from '../http.ts';
import type { DeckRequest, ProviderItem } from '../types.ts';

type GeoFeature = {
  properties?: {
    place_id?: string;
    name?: string;
    formatted?: string;
    address_line1?: string;
    categories?: string[];
    distance?: number;
    lat?: number;
    lon?: number;
    wiki_and_media?: { image?: string };
  };
};
type GeoCollection = { features?: GeoFeature[] };
type GeocodeResult = { lat?: number; lon?: number };

const categoryLabel = (categories: string[] | undefined, isFood: boolean) => {
  const leaf = categories?.find(value =>
    isFood ? value.startsWith('catering.') : value.startsWith('entertainment.'),
  );
  if (!leaf) return isFood ? 'Restaurant' : 'Local activity';
  return (
    leaf.split('.').at(-1)?.replaceAll('_', ' ') ??
    (isFood ? 'Restaurant' : 'Activity')
  );
};

async function coordinatesFor(request: DeckRequest, key: string) {
  if (Number.isFinite(request.latitude) && Number.isFinite(request.longitude)) {
    return {
      latitude: request.latitude as number,
      longitude: request.longitude as number,
    };
  }
  const query = new URLSearchParams({
    text: request.postalCode ?? '',
    format: 'json',
    limit: '1',
    apiKey: key,
    filter: `countrycode:${/^\d/.test(request.postalCode ?? '') ? 'us' : 'ca'}`,
  });
  const response = await fetchWithTimeout(
    `https://api.geoapify.com/v1/geocode/search?${query}`,
  );
  if (!response.ok)
    throw new Error(`Postal-code lookup failed with ${response.status}.`);
  const results = (await response.json()) as { results?: GeocodeResult[] };
  const first = results.results?.[0];
  if (!Number.isFinite(first?.lat) || !Number.isFinite(first?.lon)) {
    throw new Error('That ZIP or postal code could not be found.');
  }
  return { latitude: first!.lat as number, longitude: first!.lon as number };
}

async function imageFor(
  placeId: string,
  key: string,
): Promise<string | undefined> {
  const query = new URLSearchParams({
    id: placeId,
    features: 'details',
    apiKey: key,
  });
  const response = await fetchWithTimeout(
    `https://api.geoapify.com/v2/place-details?${query}`,
  );
  if (!response.ok) return undefined;
  const details = (await response.json()) as GeoCollection;
  const image = details.features?.[0]?.properties?.wiki_and_media?.image;
  return typeof image === 'string' && image.startsWith('https://')
    ? image
    : undefined;
}

export async function buildPlacesDeck(
  request: DeckRequest,
): Promise<ProviderItem[]> {
  const key = Deno.env.get('GEOAPIFY_API_KEY');
  if (!key) throw new Error('GEOAPIFY_API_KEY is not configured.');
  const { latitude, longitude } = await coordinatesFor(request, key);
  const isFood = request.mode === 'eat';
  const configuredLimit = Number(Deno.env.get('DISCOVERY_RESULT_LIMIT') ?? 10);
  const limit = Math.min(
    Math.max(request.maxResults ?? configuredLimit, 1),
    20,
  );
  const categories = isFood
    ? 'catering.restaurant'
    : 'entertainment,leisure.park';
  const query = new URLSearchParams({
    categories,
    filter: `circle:${longitude},${latitude},${Math.min(
      Math.max(request.radiusMeters ?? 15000, 500),
      25000,
    )}`,
    bias: `proximity:${longitude},${latitude}`,
    conditions: 'named',
    limit: String(limit),
    apiKey: key,
  });
  const response = await fetchWithTimeout(
    `https://api.geoapify.com/v2/places?${query}`,
  );
  if (!response.ok)
    throw new Error(`Nearby search failed with ${response.status}.`);
  const payload = (await response.json()) as GeoCollection;
  const places = (payload.features ?? [])
    .filter(feature => {
      const place = feature.properties;
      return (
        typeof place?.place_id === 'string' &&
        typeof place.name === 'string' &&
        Number.isFinite(place.lat) &&
        Number.isFinite(place.lon)
      );
    })
    .slice(0, limit);
  const images = await Promise.all(
    places.map(place => imageFor(place.properties!.place_id!, key)),
  );

  return places.map((feature, index) => {
    const place = feature.properties!;
    const [background, accent] = colorsFor(index);
    const distanceMiles =
      typeof place.distance === 'number'
        ? `${(place.distance / 1609.344).toFixed(1)} mi away`
        : 'Nearby';
    const label = categoryLabel(place.categories, isFood);
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${place.name} ${place.formatted ?? ''}`,
    )}`;
    return {
      id: `geoapify:${place.place_id}`,
      mode: request.mode,
      title: place.name!,
      kicker: isFood ? 'PICK FOOD' : 'PICK AN ACTIVITY',
      meta: `${label} · ${distanceMiles}`,
      description: place.formatted ?? place.address_line1 ?? distanceMiles,
      background,
      accent,
      tags: [isFood ? 'Food' : 'Activity', 'Nearby'],
      ...(images[index] ? { imageUrl: images[index] } : {}),
      action: { label: `Open ${place.name} in Maps`, url: mapsUrl },
    };
  });
}
