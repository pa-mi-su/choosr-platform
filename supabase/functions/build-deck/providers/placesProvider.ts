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

type GooglePhoto = {
  name?: string;
  authorAttributions?: {
    displayName?: string;
    uri?: string;
  }[];
};

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  primaryTypeDisplayName?: { text?: string };
  photos?: GooglePhoto[];
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
};

type GooglePlacesResponse = { places?: GooglePlace[] };
type GooglePhotoResponse = { photoUri?: string };

const FOOD_RESULT_LIMIT = 5;
const FOOD_SEARCH_CANDIDATE_LIMIT = 10;
const GOOGLE_PLACES_FIELDS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.primaryTypeDisplayName',
  'places.photos',
  'places.googleMapsUri',
  'places.rating',
  'places.userRatingCount',
].join(',');

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
      if (isPublicWebUrl(mediaImage, { httpsOnly: true })) {
        return (
          (await cacheVenueImage(place.place_id!, mediaImage)) ?? mediaImage
        );
      }
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
        const websiteImage = await websiteImageFor(website);
        return websiteImage
          ? (await cacheVenueImage(place.place_id!, websiteImage)) ??
              websiteImage
          : undefined;
      }
    }
  } catch {
    // Artwork is optional; continue to the mode-specific fallback.
  }
  return isFood ? undefined : mapImageFor(place, key);
}

const MAX_WEBSITE_HTML_BYTES = 512 * 1024;
const MAX_WEBSITE_REDIRECTS = 3;
const MAX_CACHED_IMAGE_BYTES = 3 * 1024 * 1024;

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

async function hashedObjectName(seed: string, extension = 'jpg') {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(seed),
  );
  return `${Array.from(new Uint8Array(digest))
    .map(value => value.toString(16).padStart(2, '0'))
    .join('')}.${extension}`;
}

function contentTypeDetails(contentType: string | null) {
  const normalized = contentType?.split(';')[0]?.trim().toLowerCase();
  if (normalized === 'image/jpeg')
    return { contentType: normalized, ext: 'jpg' };
  if (normalized === 'image/png')
    return { contentType: normalized, ext: 'png' };
  if (normalized === 'image/webp')
    return { contentType: normalized, ext: 'webp' };
  return undefined;
}

async function cacheVenueImage(placeId: string, imageUrl: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return imageUrl;
  if (!isPublicWebUrl(imageUrl, { httpsOnly: true })) return undefined;

  try {
    const response = await fetchWithTimeout(
      imageUrl,
      {
        redirect: 'follow',
        headers: {
          Accept: 'image/avif,image/webp,image/png,image/jpeg',
          'User-Agent': 'ChoosrVenueImageCache/1.0',
        },
      },
      7000,
    );
    if (!response.ok || !isPublicWebUrl(response.url, { httpsOnly: true }))
      return undefined;
    const type = contentTypeDetails(response.headers.get('content-type'));
    if (!type) return undefined;
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_CACHED_IMAGE_BYTES
    )
      return undefined;
    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_CACHED_IMAGE_BYTES)
      return undefined;

    const objectName = `venues/${await hashedObjectName(
      `${placeId}:${imageUrl}`,
      type.ext,
    )}`;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const bucket = supabase.storage.from(IMAGE_BUCKET);
    const publicUrl = bucket.getPublicUrl(objectName).data.publicUrl;
    const { data: existing } = await bucket.list('venues', {
      limit: 1,
      search: objectName.split('/').at(-1),
    });
    if (existing?.some(object => `venues/${object.name}` === objectName))
      return publicUrl;
    const { error } = await bucket.upload(objectName, bytes, {
      contentType: type.contentType,
      cacheControl: '2592000',
      upsert: true,
    });
    return error ? undefined : publicUrl;
  } catch {
    return undefined;
  }
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
    const objectName = await hashedObjectName(place.place_id);
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

const radians = (degrees: number) => (degrees * Math.PI) / 180;

function distanceMiles(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(from.latitude)) *
      Math.cos(radians(to.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function validGooglePlace(
  place: GooglePlace,
): place is GooglePlace & {
  id: string;
  displayName: { text: string };
  location: { latitude: number; longitude: number };
  googleMapsUri: string;
} {
  return (
    typeof place.id === 'string' &&
    typeof place.displayName?.text === 'string' &&
    Number.isFinite(place.location?.latitude) &&
    Number.isFinite(place.location?.longitude) &&
    typeof place.googleMapsUri === 'string' &&
    place.googleMapsUri.startsWith('https://')
  );
}

async function googlePhotoUri(photo: GooglePhoto | undefined, key: string) {
  if (typeof photo?.name !== 'string') return undefined;
  const query = new URLSearchParams({
    key,
    maxWidthPx: '1200',
    maxHeightPx: '900',
    skipHttpRedirect: 'true',
  });
  try {
    const response = await fetchWithTimeout(
      `https://places.googleapis.com/v1/${photo.name}/media?${query}`,
      {},
      7000,
    );
    if (!response.ok) return undefined;
    const payload = (await response.json()) as GooglePhotoResponse;
    return isPublicWebUrl(payload.photoUri, { httpsOnly: true })
      ? payload.photoUri
      : undefined;
  } catch {
    return undefined;
  }
}

async function buildGoogleFoodDeck(
  request: DeckRequest,
  location: { latitude: number; longitude: number },
): Promise<ProviderItem[]> {
  const key = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!key) throw new Error('GOOGLE_PLACES_API_KEY is not configured.');
  const radius = Math.min(
    Math.max(request.radiusMeters ?? 15000, 500),
    25000,
  );
  const response = await fetchWithTimeout(
    'https://places.googleapis.com/v1/places:searchNearby',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': GOOGLE_PLACES_FIELDS,
      },
      body: JSON.stringify({
        includedTypes: ['restaurant'],
        // Ask Google for a small candidate pool, then return only five cards.
        // This lets Choosr prefer restaurants with real venue photos without
        // increasing the deck size or resolving more than five photo URLs.
        maxResultCount: FOOD_SEARCH_CANDIDATE_LIMIT,
        rankPreference: 'POPULARITY',
        locationRestriction: {
          circle: {
            center: {
              latitude: location.latitude,
              longitude: location.longitude,
            },
            radius,
          },
        },
      }),
    },
    8000,
  );
  if (!response.ok) {
    throw new Error(`Google nearby search failed with ${response.status}.`);
  }
  const payload = (await response.json()) as GooglePlacesResponse;
  const places = (payload.places ?? [])
    .filter(validGooglePlace)
    .sort((left, right) => {
      const photoDifference =
        Number(Boolean(right.photos?.length)) -
        Number(Boolean(left.photos?.length));
      return photoDifference || (right.rating ?? 0) - (left.rating ?? 0);
    })
    .slice(0, FOOD_RESULT_LIMIT);
  const images = await Promise.all(
    places.map(place => googlePhotoUri(place.photos?.[0], key)),
  );

  return places.map((place, index) => {
    const [background, accent] = colorsFor(index);
    const miles = distanceMiles(location, {
      latitude: place.location.latitude,
      longitude: place.location.longitude,
    });
    const type = place.primaryTypeDisplayName?.text ?? 'Restaurant';
    const rating =
      typeof place.rating === 'number'
        ? `★ ${place.rating.toFixed(1)}${
            typeof place.userRatingCount === 'number'
              ? ` (${place.userRatingCount.toLocaleString('en-US')})`
              : ''
          }`
        : undefined;
    const author = place.photos?.[0]?.authorAttributions?.[0];
    const attributionLabel = [
      'Google Maps',
      author?.displayName ? `Photo by ${author.displayName}` : undefined,
    ]
      .filter(Boolean)
      .join(' · ');

    return {
      id: `google:${place.id}`,
      mode: 'eat',
      title: place.displayName.text,
      kicker: 'PICK FOOD',
      meta: [type, `${miles.toFixed(1)} mi away`, rating]
        .filter(Boolean)
        .join(' · '),
      description: place.formattedAddress ?? `${miles.toFixed(1)} mi away`,
      background,
      accent,
      tags: ['Food', type, 'Nearby'],
      ...(images[index] ? { imageUrl: images[index] } : {}),
      action: {
        label: `Open ${place.displayName.text} in Google Maps`,
        url: place.googleMapsUri,
      },
      attribution: {
        label: attributionLabel,
        url:
          typeof author?.uri === 'string' &&
          author.uri.startsWith('https://')
            ? author.uri
            : place.googleMapsUri,
      },
    };
  });
}

export async function buildPlacesDeck(
  request: DeckRequest,
): Promise<ProviderItem[]> {
  const key = Deno.env.get('GEOAPIFY_API_KEY');
  if (!key) throw new Error('GEOAPIFY_API_KEY is not configured.');
  const { latitude, longitude } = await coordinatesFor(request, key);
  const isFood = request.mode === 'eat';
  if (isFood) {
    return buildGoogleFoodDeck(request, { latitude, longitude });
  }
  const configuredLimit = Number(Deno.env.get('DISCOVERY_RESULT_LIMIT') ?? 10);
  const limit = Math.min(
    Math.max(request.maxResults ?? configuredLimit, 1),
    20,
  );
  const categories = 'entertainment,leisure.park';
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
    places.map(place => imageFor(place.properties!, key, false)),
  );

  return places.map((feature, index) => {
    const place = feature.properties!;
    const [background, accent] = colorsFor(index);
    const formattedDistance =
      typeof place.distance === 'number'
        ? `${(place.distance / 1609.344).toFixed(1)} mi away`
        : 'Nearby';
    const label = categoryLabel(place.categories, false);
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${place.name} ${place.formatted ?? ''}`,
    )}`;
    return {
      id: `geoapify:${place.place_id}`,
      mode: request.mode,
      title: place.name!,
      kicker: 'PICK AN ACTIVITY',
      meta: `${label} · ${formattedDistance}`,
      description: place.formatted ?? place.address_line1 ?? formattedDistance,
      background,
      accent,
      tags: ['Activity', 'Nearby'],
      ...(images[index] ? { imageUrl: images[index] } : {}),
      action: { label: `Open ${place.name} in Maps`, url: mapsUrl },
    };
  });
}
