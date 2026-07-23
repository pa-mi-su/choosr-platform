# build-deck

Protected content adapter for the Choosr decision engine.

- `eat` and `do` geocode a ZIP/postal code and query Geoapify Places using
  `GEOAPIFY_API_KEY`. The free commercial tier is sufficient for MVP traffic.
- Provider credentials are Supabase secrets and never mobile environment values.
- `DISCOVERY_RESULT_LIMIT` optionally changes the server default (10, bounded to 1–20).
- Place-details media is preferred when available. Food results may use the restaurant
  website's published link-preview image (`og:image`, structured data, or site icon)
  without copying the image into Supabase. Activity results retain the cached static-map
  fallback. Food results never use a map as their primary artwork.
- Website previews use HTTPS only, reject local/private-network URLs and redirects, enforce
  strict response size/time limits, and remain optional. The restaurant card still renders
  its designed fallback when a site does not publish usable preview artwork.

Local setup:

```sh
supabase secrets set --env-file supabase/.env.local
supabase functions serve build-deck --env-file supabase/.env.local
```

Never commit `supabase/.env.local`.
