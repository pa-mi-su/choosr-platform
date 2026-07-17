import { colorsFor } from '../presentation.ts';
import { fetchWithTimeout } from '../http.ts';
import type { DeckRequest, ProviderItem } from '../types.ts';

type LocalizedText = { text?: string };
type GooglePlace = {
  id?: string;
  displayName?: LocalizedText;
  formattedAddress?: string;
  primaryTypeDisplayName?: LocalizedText;
  googleMapsUri?: string;
};
type GooglePlacesResponse = { places?: GooglePlace[] };

type UsablePlace = GooglePlace & {
  id: string;
  displayName: { text: string };
  googleMapsUri: string;
};

const isUsablePlace = (place: GooglePlace): place is UsablePlace =>
  typeof place.id === 'string' &&
  typeof place.displayName?.text === 'string' &&
  typeof place.googleMapsUri === 'string';

export async function buildPlacesDeck(
  request: DeckRequest,
): Promise<ProviderItem[]> {
  const key = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!key) {
    throw new Error('GOOGLE_PLACES_API_KEY is not configured.');
  }
  if (
    !Number.isFinite(request.latitude) ||
    !Number.isFinite(request.longitude)
  ) {
    throw new Error('A valid latitude and longitude are required.');
  }
  const isFood = request.mode === 'eat';
  const response = await fetchWithTimeout(
    'https://places.googleapis.com/v1/places:searchNearby',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.primaryTypeDisplayName,places.googleMapsUri',
      },
      body: JSON.stringify({
        includedTypes: isFood
          ? ['restaurant']
          : [
              'bowling_alley',
              'cafe',
              'museum',
              'park',
              'performing_arts_theater',
            ],
        maxResultCount: 20,
        rankPreference: 'POPULARITY',
        locationRestriction: {
          circle: {
            center: {
              latitude: request.latitude,
              longitude: request.longitude,
            },
            radius: Math.min(
              Math.max(request.radiusMeters ?? 5000, 500),
              25000,
            ),
          },
        },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Google Places request failed with ${response.status}.`);
  }
  const payload = (await response.json()) as GooglePlacesResponse;
  return (payload.places ?? []).filter(isUsablePlace).map((place, index) => {
    const [background, accent] = colorsFor(index);
    const title = place.displayName.text;
    return {
      id: `google:${place.id}`,
      mode: request.mode,
      title,
      kicker: isFood ? 'DINNER TOGETHER' : 'A PLAN TOGETHER',
      meta:
        place.primaryTypeDisplayName?.text ??
        (isFood ? 'Restaurant' : 'Local activity'),
      description: place.formattedAddress ?? 'Nearby',
      background,
      accent,
      tags: [isFood ? 'Food' : 'Activity', 'Nearby'],
      action: {
        label: `Open ${title} in Maps`,
        url: place.googleMapsUri,
      },
    };
  });
}
