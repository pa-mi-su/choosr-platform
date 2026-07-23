import { createClient } from 'npm:@supabase/supabase-js@2.110.7';

import { colorsFor } from '../presentation.ts';
import { fetchWithTimeout } from '../http.ts';
import type { DeckRequest, ProviderItem } from '../types.ts';
import {
  extractWebsiteImageFromHtml,
  isPublicWebUrl,
} from './websitePreview.ts';

const IMAGE_BUCKET = 'discovery-images';

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
    website?: string;
    contact?: { website?: string };
    datasource?: {
      raw?: {
        website?: string;
        'contact:website'?: string;
      };
    };
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
  place: NonNullable<GeoFeature['properties']>,
  key: string,
  isFood: boolean,
): Promise<string | undefined> {
  try {
    const query = new URLSearchParams({
      id: place.place_id!,
      features: 'details',
      apiKey: key,
    });
    const response = await fetchWithTimeout(
      `https://api.geoapify.com/v2/place-details?${query}`,
    );
    if (response.ok) {
      const details = (await response.json()) as GeoCollection;
      const detail = details.features?.[0]?.properties;
      const mediaImage = detail?.wiki_and_media?.image;
      if (isPublicWebUrl(mediaImage, { httpsOnly: true })) return mediaImage;
      if (isFood) {
        const website =
          detail?.website ??
          detail?.contact?.website ??
          detail?.datasource?.raw?.website ??
          detail?.datasource?.raw?.['contact:website'] ??
          place.website ??
          place.contact?.website ??
          place.datasource?.raw?.website ??
          place.datasource?.raw?.['contact:website'];
        return websiteImageFor(website);
      }
    }
  } catch {
    // Artwork is optional; continue to the mode-specific fallback.
  }
  return isFood ? undefined : mapImageFor(place, key);
}

const MAX_WEBSITE_HTML_BYTES = 512 * 1024;
const MAX_WEBSITE_REDIRECTS = 3;

async function limitedHtml(response: Response) {
  if (!response.body) return undefined;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let html = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_WEBSITE_HTML_BYTES) {
        await reader.cancel();
        return undefined;
      }
      html += decoder.decode(value, { stream: true });
    }
    return html + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

async function websiteImageFor(value: unknown) {
  if (typeof value !== 'string') return undefined;
  let current: URL;
  try {
    const firstWebsite = value.trim().split(';')[0]?.trim();
    if (!firstWebsite) return undefined;
    current = new URL(
      /^[a-z][a-z\d+.-]*:/i.test(firstWebsite)
        ? firstWebsite
        : `https://${firstWebsite}`,
    );
    if (current.protocol === 'http:') current.protocol = 'https:';
  } catch {
    return undefined;
  }

  for (let redirects = 0; redirects <= MAX_WEBSITE_REDIRECTS; redirects += 1) {
    if (!isPublicWebUrl(current.toString(), { httpsOnly: true }))
      return undefined;
    try {
      const response = await fetchWithTimeout(
        current,
        {
          redirect: 'manual',
          headers: {
            Accept: 'text/html,application/xhtml+xml',
            'User-Agent': 'ChoosrLinkPreview/1.0',
          },
        },
        5000,
      );
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) return undefined;
        current = new URL(location, current);
        continue;
      }
      if (!response.ok) return undefined;
      const contentType = response.headers.get('content-type')?.toLowerCase();
      if (contentType && !contentType.includes('text/html')) return undefined;
      const contentLength = Number(response.headers.get('content-length') ?? 0);
      if (
        Number.isFinite(contentLength) &&
        contentLength > MAX_WEBSITE_HTML_BYTES
      )
        return undefined;
      const html = await limitedHtml(response);
      return html
        ? extractWebsiteImageFromHtml(html, current.toString())
        : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

async function imageObjectName(placeId: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(placeId),
  );
  return `${Array.from(new Uint8Array(digest))
    .map(value => value.toString(16).padStart(2, '0'))
    .join('')}.jpg`;
}

async function mapImageFor(
  place: NonNullable<GeoFeature['properties']>,
  key: string,
) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (
    !supabaseUrl ||
    !serviceKey ||
    !place.place_id ||
    !Number.isFinite(place.lat) ||
    !Number.isFinite(place.lon)
  )
    return undefined;

  try {
    const objectName = await imageObjectName(place.place_id);
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: existing } = await supabase.storage
      .from(IMAGE_BUCKET)
      .list('', { limit: 1, search: objectName });
    const publicUrl = supabase.storage
      .from(IMAGE_BUCKET)
      .getPublicUrl(objectName).data.publicUrl;
    if (existing?.some(object => object.name === objectName)) return publicUrl;

    const query = new URLSearchParams({
      style: 'osm-bright',
      width: '800',
      height: '600',
      format: 'jpeg',
      center: `lonlat:${place.lon},${place.lat}`,
      zoom: '15',
      marker: `lonlat:${place.lon},${place.lat};type:material;color:#ff5b22;size:large`,
      apiKey: key,
    });
    const response = await fetchWithTimeout(
      `https://maps.geoapify.com/v1/staticmap?${query}`,
      {},
      6000,
    );
    if (!response.ok) return undefined;
    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 2 * 1024 * 1024)
      return undefined;
    const { error } = await supabase.storage
      .from(IMAGE_BUCKET)
      .upload(objectName, bytes, {
        contentType: 'image/jpeg',
        cacheControl: '604800',
        upsert: true,
      });
    return error ? undefined : publicUrl;
  } catch {
    return undefined;
  }
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
    places.map(place => imageFor(place.properties!, key, isFood)),
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
