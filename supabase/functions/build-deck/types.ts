export type DecisionMode = 'eat' | 'do';

export type DeckRequest = {
  mode: DecisionMode;
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
  region?: string;
};

export type ProviderItem = {
  id: string;
  mode: DecisionMode;
  title: string;
  kicker: string;
  meta: string;
  description: string;
  background: string;
  accent: string;
  tags: string[];
  action?: { label: string; url: string };
};

export class DeckRequestError extends Error {}

const parseMode = (value: unknown): DecisionMode => {
  if (value === 'eat' || value === 'do') {
    return value;
  }
  throw new DeckRequestError('Unsupported decision mode.');
};

const optionalNumber = (
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new DeckRequestError(`Invalid ${field}.`);
  }
  return value;
};

export function parseDeckRequest(value: unknown): DeckRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DeckRequestError('Request body must be an object.');
  }
  const body = value as Record<string, unknown>;
  const mode = parseMode(body.mode);
  const latitude = optionalNumber(body.latitude, 'latitude', -90, 90);
  const longitude = optionalNumber(body.longitude, 'longitude', -180, 180);
  const radiusMeters = optionalNumber(
    body.radiusMeters,
    'radiusMeters',
    500,
    25000,
  );
  if (latitude === undefined || longitude === undefined) {
    throw new DeckRequestError(
      'A valid latitude and longitude are required for local modes.',
    );
  }
  const region = body.region ?? 'US';
  if (typeof region !== 'string' || !/^[A-Za-z]{2}$/.test(region)) {
    throw new DeckRequestError('Invalid region.');
  }

  return {
    mode,
    region: region.toUpperCase(),
    ...(latitude === undefined ? {} : { latitude }),
    ...(longitude === undefined ? {} : { longitude }),
    ...(radiusMeters === undefined ? {} : { radiusMeters }),
  };
}
