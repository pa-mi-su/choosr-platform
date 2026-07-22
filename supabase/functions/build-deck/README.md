# build-deck

Protected content adapter for the Choosr decision engine.

- `eat` and `do` geocode a ZIP/postal code and query Geoapify Places using
  `GEOAPIFY_API_KEY`. The free commercial tier is sufficient for MVP traffic.
- Provider credentials are Supabase secrets and never mobile environment values.
- `DISCOVERY_RESULT_LIMIT` optionally changes the server default (10, bounded to 1–20).
- Place-details media is used only when a licensed image is available; the client renders a
  designed fallback rather than scraping Google or Yelp imagery.

Local setup:

```sh
supabase secrets set --env-file supabase/.env.local
supabase functions serve build-deck --env-file supabase/.env.local
```

Never commit `supabase/.env.local`.
