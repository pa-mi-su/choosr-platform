# build-deck

Protected content adapter for the Choosr decision engine.

- `do` geocodes a ZIP/postal code and queries Geoapify Places using
  `GEOAPIFY_API_KEY`.
- `eat` uses the same server-side geocoding boundary, then queries Google Places API
  (New) with `GOOGLE_PLACES_API_KEY`. The creator's cuisine preference maps to
  supported Google Place types in the provider query.
- Provider credentials are Supabase secrets and never mobile environment values.
- Food decks are hard-capped at five restaurants. Cards include a Google place photo when
  available, cuisine/type, rating and review count, distance, address, Google Maps action,
  and visible Google/photo attribution.
- Food choices are sampled from a quality-ranked candidate pool instead of
  always taking the same top five. Repeated identical searches can therefore
  rotate the actual restaurants while retaining quality and distance signals.
- Google photo media is resolved and cached by the Edge Function in the
  `discovery-images` bucket. The Google API key never appears in the mobile payload.
- `DISCOVERY_RESULT_LIMIT` optionally changes the Activity default (10, bounded to 1–20).
- Activity results retain the cached static-map fallback. Food results never use a map or a
  generic food icon as their primary artwork.
- Provider image URLs must be public HTTPS endpoints; local and private-network targets are
  rejected before the image cache boundary.

Local setup:

```sh
supabase secrets set --env-file supabase/.env.local
supabase functions serve build-deck --env-file supabase/.env.local
```

Never commit `supabase/.env.local`.
