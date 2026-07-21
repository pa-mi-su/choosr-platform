import { isAuthenticated } from './auth.ts';
import { jsonResponse } from './http.ts';
import { buildPlacesDeck } from './providers/placesProvider.ts';
import {
  DeckRequestError,
  parseDeckRequest,
  type DeckRequest,
} from './types.ts';

Deno.serve(async request => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Authentication required.' }, 401);
  }
  let authenticated = false;
  try {
    authenticated = await isAuthenticated(authorization);
  } catch {
    return jsonResponse({ error: 'Authentication service unavailable.' }, 503);
  }
  if (!authenticated) {
    return jsonResponse({ error: 'Invalid authentication token.' }, 401);
  }

  let body: DeckRequest;
  try {
    body = parseDeckRequest(await request.json());
  } catch (error) {
    const message =
      error instanceof DeckRequestError
        ? error.message
        : 'Request body must be valid JSON.';
    return jsonResponse({ error: message }, 400);
  }

  try {
    const items = await buildPlacesDeck(body);
    if (!items.length) {
      return jsonResponse({ error: 'No options found for this search.' }, 404);
    }
    return jsonResponse({ mode: body.mode, items });
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'Deck creation failed.',
      },
      503,
    );
  }
});
