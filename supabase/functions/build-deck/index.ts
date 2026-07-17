type DecisionMode = 'watch' | 'eat' | 'do';

type RequestBody = {
  mode: DecisionMode;
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
  region?: string;
  query?: string;
};

const palette = [
  ['#20344A', '#F0B7A4'],
  ['#173F42', '#78D6C6'],
  ['#5D284A', '#FF8FAB'],
  ['#493548', '#F4B860'],
  ['#244B3A', '#70D6A6'],
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

async function isAuthenticated(authorization: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const publishableKey =
    Deno.env.get('SUPABASE_ANON_KEY') ??
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  if (!supabaseUrl || !publishableKey) {
    return false;
  }
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: authorization,
      apikey: publishableKey,
    },
  });
  return response.ok;
}

async function buildWatchDeck(region: string) {
  const token = Deno.env.get('TMDB_API_READ_TOKEN');
  if (!token) {
    throw new Error('TMDB_API_READ_TOKEN is not configured.');
  }
  const url = new URL('https://api.themoviedb.org/3/discover/movie');
  url.searchParams.set('include_adult', 'false');
  url.searchParams.set('include_video', 'false');
  url.searchParams.set('language', 'en-US');
  url.searchParams.set('region', region);
  url.searchParams.set('sort_by', 'popularity.desc');
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`TMDB request failed with ${response.status}.`);
  }
  const payload = await response.json();
  return payload.results
    .slice(0, 20)
    .map((movie: Record<string, unknown>, index: number) => {
      const [background, accent] = palette[index % palette.length];
      return {
        id: `tmdb:${movie.id}`,
        mode: 'watch',
        title: movie.title,
        kicker: 'A FILM TOGETHER',
        meta: `${
          String(movie.release_date ?? '').slice(0, 4) || 'Movie'
        } · ★ ${Number(movie.vote_average ?? 0).toFixed(1)}`,
        description: movie.overview || 'Discover this movie together.',
        background,
        accent,
        tags: ['Movie', 'TMDB'],
      };
    });
}

async function buildPlacesDeck(body: RequestBody) {
  const key = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!key) {
    throw new Error('GOOGLE_PLACES_API_KEY is not configured.');
  }
  if (!Number.isFinite(body.latitude) || !Number.isFinite(body.longitude)) {
    throw new Error('A valid latitude and longitude are required.');
  }
  const isFood = body.mode === 'eat';
  const response = await fetch(
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
              latitude: body.latitude,
              longitude: body.longitude,
            },
            radius: Math.min(Math.max(body.radiusMeters ?? 5000, 500), 25000),
          },
        },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Google Places request failed with ${response.status}.`);
  }
  const payload = await response.json();
  return (payload.places ?? []).map(
    (place: Record<string, any>, index: number) => {
      const [background, accent] = palette[index % palette.length];
      const title = place.displayName?.text ?? 'Local place';
      return {
        id: `google:${place.id}`,
        mode: body.mode,
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
    },
  );
}

Deno.serve(async request => {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return json({ error: 'Authentication required.' }, 401);
  }
  if (!(await isAuthenticated(authorization))) {
    return json({ error: 'Invalid authentication token.' }, 401);
  }
  try {
    const body = (await request.json()) as RequestBody;
    if (!['watch', 'eat', 'do'].includes(body.mode)) {
      return json({ error: 'Unsupported decision mode.' }, 400);
    }
    const items =
      body.mode === 'watch'
        ? await buildWatchDeck((body.region ?? 'US').toUpperCase())
        : await buildPlacesDeck(body);
    return json({ mode: body.mode, items });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : 'Deck creation failed.',
      },
      503,
    );
  }
});
