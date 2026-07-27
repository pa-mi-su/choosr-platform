import { createClient } from 'npm:@supabase/supabase-js@2.110.7';

import { authenticatedUserId } from './auth.ts';
import { jsonResponse } from './http.ts';
import { buildPlacesDeck } from './providers/placesProvider.ts';
import {
  DeckRequestError,
  parseDeckRequest,
  type DeckRequest,
} from './types.ts';

function shuffleOnce<T>(values: T[]): T[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const swapIndex = random[0]! % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex]!,
      shuffled[index]!,
    ];
  }
  return shuffled;
}

Deno.serve(async request => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Authentication required.' }, 401);
  }
  let userId: string | undefined;
  try {
    userId = await authenticatedUserId(authorization);
  } catch {
    return jsonResponse({ error: 'Authentication service unavailable.' }, 503);
  }
  if (!userId) {
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
    if (body.sessionId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (!supabaseUrl || !serviceKey) {
        throw new Error('Room preparation service is not configured.');
      }
      const service = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: contexts, error: contextError } = await service.rpc(
        'get_location_deck_context',
        {
          p_session_id: body.sessionId,
          p_user_id: userId,
        },
      );
      if (contextError) throw contextError;
      const context = Array.isArray(contexts) ? contexts[0] : undefined;
      if (context?.mode !== body.mode) {
        throw new DeckRequestError('Room mode does not match the request.');
      }
      if (context?.preparation_status === 'ready') {
        return jsonResponse({
          mode: body.mode,
          status: 'ready',
          items: [],
        });
      }
      if (
        context?.preparation_status !== 'needs-build' ||
        !Number.isFinite(context.latitude) ||
        !Number.isFinite(context.longitude)
      ) {
        throw new Error('The room creator location is unavailable.');
      }
      const participantLocations = [
        {
          latitude: Number(context.latitude),
          longitude: Number(context.longitude),
        },
      ];
      const items = shuffleOnce(
        await buildPlacesDeck({
          ...body,
          mode: context.mode,
          latitude: participantLocations[0].latitude,
          longitude: participantLocations[0].longitude,
          locationLabel: context.location_label,
          cuisineFilter: context.cuisine_filter,
          participantLocations,
        }),
      );
      if (!items.length) {
        return jsonResponse(
          { error: 'No options found for this search.' },
          404,
        );
      }
      const { error: finalizeError } = await service.rpc(
        'finalize_location_session',
        {
          p_session_id: body.sessionId,
          p_items: items,
        },
      );
      if (finalizeError) throw finalizeError;
      return jsonResponse({ mode: body.mode, status: 'ready', items });
    }

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
