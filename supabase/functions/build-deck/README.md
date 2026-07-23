# build-deck

Protected content adapter for the Choosr decision engine.

- `do` geocodes a ZIP/postal code and queries Geoapify Places using
  `GEOAPIFY_API_KEY`.
- `eat` uses the same server-side geocoding boundary, then queries Google Places API
  (New) with `GOOGLE_PLACES_API_KEY`.
- Provider credentials are Supabase secrets and never mobile environment values.
- Food decks are hard-capped at five restaurants. Cards include a Google place photo when
  available, cuisine/type, rating and review count, distance, address, Google Maps action,
  and visible Google/photo attribution.
- Google photo media is resolved by the Edge Function. The Google API key never appears in
  the mobile payload and Google photo content is not copied into Supabase Storage.
- `DISCOVERY_RESULT_LIMIT` optionally changes the Activity default (10, bounded to 1–20).
- Activity results retain the cached static-map fallback. Food results never use a map or a
  generic food icon as their primary artwork.
- Website previews use HTTPS only, reject local/private-network URLs and redirects, enforce
  strict response size/time limits, and remain optional. The restaurant card still renders
  its designed fallback when a site does not publish usable preview artwork.

Local setup:

```sh
supabase secrets set --env-file supabase/.env.local
supabase functions serve build-deck --env-file supabase/.env.local
```

Never commit `supabase/.env.local`.
