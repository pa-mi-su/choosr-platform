# build-deck

Protected content adapter for the Choosr decision engine.

- `eat` and `do` call Google Places Nearby Search using `GOOGLE_PLACES_API_KEY`.
- Provider credentials are Supabase secrets and never mobile environment values.
- The Places field mask intentionally excludes ratings, price, hours, and photos to keep the
  initial request in the smallest practical data shape. Review current Google SKU rules before
  adding fields.

Local setup:

```sh
supabase secrets set --env-file supabase/.env.local
supabase functions serve build-deck --env-file supabase/.env.local
```

Never commit `supabase/.env.local`.
