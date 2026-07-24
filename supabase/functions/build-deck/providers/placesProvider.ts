import { createClient } from 'npm:@supabase/supabase-js@2.110.7';

import { colorsFor } from '../presentation.ts';
import { fetchWithTimeout } from '../http.ts';
import type { DeckRequest, ProviderItem } from '../types.ts';
import { isPublicWebUrl } from './websitePreview.ts';

const IMAGE_BUCKET = 'discovery-images';

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
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  photos?: GooglePhoto[];
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
};

type GooglePlacesResponse = { places?: GooglePlace[] };

const GOOGLE_RESULT_LIMIT = 5;
const GOOGLE_SEARCH_CANDIDATE_LIMIT = 20;
const SEARCH_RADII_METERS = [8047, 16093, 32187] as const;
const ACTIVITY_TYPES = [
  'adventure_sports_center',
  'amusement_center',
  'amusement_park',
  'aquarium',
  'art_gallery',
  'botanical_garden',
  'bowling_alley',
  'comedy_club',
  'concert_hall',
  'go_karting_venue',
  'hiking_area',
  'ice_skating_rink',
  'indoor_playground',
  'live_music_venue',
  'miniature_golf_course',
  'movie_theater',
  'museum',
  'observation_deck',
  'paintball_center',
  'performing_arts_theater',
  'planetarium',
  'sports_activity_location',
  'video_arcade',
  'water_park',
  'wildlife_park',
  'zoo',
] as const;
const EXCLUDED_ACTIVITY_TYPES = [
  'association_or_organization',
  'campground',
  'rv_park',
] as const;
const GOOGLE_PLACES_FIELDS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.primaryType',
  'places.primaryTypeDisplayName',
  'places.photos',
  'places.googleMapsUri',
  'places.rating',
  'places.userRatingCount',
].join(',');

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

const MAX_CACHED_IMAGE_BYTES = 2 * 1024 * 1024;

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
  // Never return a Google photo URL because it contains the server API key.
  if (!supabaseUrl || !serviceKey) return undefined;
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
      6000,
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

function validGooglePlace(place: GooglePlace): place is GooglePlace & {
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

function googlePhotoSource(photo: GooglePhoto | undefined, key: string) {
  if (typeof photo?.name !== 'string') return undefined;
  const query = new URLSearchParams({
    key,
    maxWidthPx: '1200',
    maxHeightPx: '900',
  });
  return `https://places.googleapis.com/v1/${photo.name}/media?${query}`;
}

type ValidGooglePlace = GooglePlace & {
  id: string;
  displayName: { text: string };
  location: { latitude: number; longitude: number };
  googleMapsUri: string;
};

function midpoint(locations: { latitude: number; longitude: number }[]): {
  latitude: number;
  longitude: number;
} {
  if (locations.length < 2) return locations[0]!;
  const [left, right] = locations;
  const leftLatitude = radians(left.latitude);
  const leftLongitude = radians(left.longitude);
  const rightLatitude = radians(right.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const x = Math.cos(rightLatitude) * Math.cos(longitudeDelta);
  const y = Math.cos(rightLatitude) * Math.sin(longitudeDelta);
  const latitude = Math.atan2(
    Math.sin(leftLatitude) + Math.sin(rightLatitude),
    Math.sqrt((Math.cos(leftLatitude) + x) ** 2 + y ** 2),
  );
  const longitude = leftLongitude + Math.atan2(y, Math.cos(leftLatitude) + x);
  return {
    latitude: (latitude * 180) / Math.PI,
    longitude: (((longitude * 180) / Math.PI + 540) % 360) - 180,
  };
}

function placeScore(
  place: ValidGooglePlace,
  participantLocations: { latitude: number; longitude: number }[],
) {
  const distances = participantLocations.map(location =>
    distanceMiles(location, place.location),
  );
  const fairnessPenalty =
    distances.length > 1
      ? Math.max(...distances) * 0.35 +
        Math.abs(distances[0]! - distances[1]!) * 0.8
      : distances[0]! * 0.25;
  return (
    (place.photos?.length ? 4 : 0) +
    (place.rating ?? 0) * 2 +
    Math.log10((place.userRatingCount ?? 0) + 1) * 2 -
    fairnessPenalty
  );
}

function diverseTopPlaces(candidates: ValidGooglePlace[]) {
  const selected: ValidGooglePlace[] = [];
  const typeCounts = new Map<string, number>();
  for (const place of candidates) {
    const type = place.primaryType ?? 'other';
    const count = typeCounts.get(type) ?? 0;
    if (count >= 2) continue;
    selected.push(place);
    typeCounts.set(type, count + 1);
    if (selected.length === GOOGLE_RESULT_LIMIT) break;
  }
  for (const place of candidates) {
    if (selected.length === GOOGLE_RESULT_LIMIT) break;
    if (!selected.some(candidate => candidate.id === place.id)) {
      selected.push(place);
    }
  }
  return selected;
}

async function searchGooglePlaces(
  key: string,
  mode: 'eat' | 'do',
  center: { latitude: number; longitude: number },
  radius: number,
) {
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
        includedTypes: mode === 'eat' ? ['restaurant'] : ACTIVITY_TYPES,
        ...(mode === 'eat' ? {} : { excludedTypes: EXCLUDED_ACTIVITY_TYPES }),
        maxResultCount: GOOGLE_SEARCH_CANDIDATE_LIMIT,
        rankPreference: 'POPULARITY',
        locationRestriction: { circle: { center, radius } },
      }),
    },
    5000,
  );
  if (!response.ok) {
    throw new Error(`Google nearby search failed with ${response.status}.`);
  }
  return ((await response.json()) as GooglePlacesResponse).places ?? [];
}

async function buildGoogleNearbyDeck(
  request: DeckRequest,
  fallbackLocation: { latitude: number; longitude: number },
): Promise<ProviderItem[]> {
  const key = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!key) throw new Error('GOOGLE_PLACES_API_KEY is not configured.');
  const participantLocations = request.participantLocations?.length
    ? request.participantLocations
    : [fallbackLocation];
  const center = midpoint(participantLocations);
  const radii = request.radiusMeters
    ? [Math.min(Math.max(request.radiusMeters, 500), 50000)]
    : SEARCH_RADII_METERS;
  const candidatesById = new Map<string, ValidGooglePlace>();

  for (const radius of radii) {
    const candidates = await searchGooglePlaces(
      key,
      request.mode,
      center,
      radius,
    );
    candidates.filter(validGooglePlace).forEach(place => {
      candidatesById.set(place.id, place);
    });
    if (candidatesById.size >= GOOGLE_RESULT_LIMIT) break;
  }

  const places = diverseTopPlaces(
    [...candidatesById.values()].sort(
      (left, right) =>
        placeScore(right, participantLocations) -
        placeScore(left, participantLocations),
    ),
  );
  const images = await Promise.all(
    places.map(async place => {
      const source = googlePhotoSource(place.photos?.[0], key);
      return source
        ? await cacheVenueImage(`google:${place.id}`, source)
        : undefined;
    }),
  );

  return places.map((place, index) => {
    const [background, accent] = colorsFor(index);
    const participantDistances = participantLocations.map(location =>
      distanceMiles(location, place.location),
    );
    const distanceLabel =
      participantDistances.length > 1
        ? `${participantDistances[0]!.toFixed(
            1,
          )} / ${participantDistances[1]!.toFixed(1)} mi`
        : `${participantDistances[0]!.toFixed(1)} mi away`;
    const isFood = request.mode === 'eat';
    const type =
      place.primaryTypeDisplayName?.text ??
      (isFood ? 'Restaurant' : 'Local activity');
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
      mode: request.mode,
      title: place.displayName.text,
      kicker: isFood ? 'PICK FOOD' : 'PICK AN ACTIVITY',
      meta: [type, distanceLabel, rating].filter(Boolean).join(' · '),
      description: place.formattedAddress ?? distanceLabel,
      background,
      accent,
      tags: [isFood ? 'Food' : 'Activity', type, 'Meet halfway'],
      ...(images[index] ? { imageUrl: images[index] } : {}),
      action: {
        label: `Open ${place.displayName.text} in Google Maps`,
        url: place.googleMapsUri,
      },
      attribution: {
        label: attributionLabel,
        url:
          typeof author?.uri === 'string' && author.uri.startsWith('https://')
            ? author.uri
            : place.googleMapsUri,
      },
    };
  });
}

export async function buildPlacesDeck(
  request: DeckRequest,
): Promise<ProviderItem[]> {
  const hasCoordinates =
    Number.isFinite(request.latitude) && Number.isFinite(request.longitude);
  const geoapifyKey = Deno.env.get('GEOAPIFY_API_KEY');
  if (!hasCoordinates && !geoapifyKey) {
    throw new Error('GEOAPIFY_API_KEY is not configured.');
  }
  const location = hasCoordinates
    ? {
        latitude: request.latitude as number,
        longitude: request.longitude as number,
      }
    : await coordinatesFor(request, geoapifyKey!);
  return buildGoogleNearbyDeck(request, location);
}
