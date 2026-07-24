import { createClient } from 'npm:@supabase/supabase-js@2.110.7';
import {
  type ChatAction,
  type ChatRequestBody,
  validateChatRequest,
} from './validation.ts';

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server configuration: ${name}.`);
  return value;
}

Deno.serve(async request => {
  if (request.method !== 'POST') {
    return response({ error: 'Method not allowed.' }, 405);
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return response({ error: 'Authentication required.' }, 401);
  }
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 24576) {
    return response({ error: 'Request is too large.' }, 413);
  }

  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return response({ error: 'Request body must be valid JSON.' }, 400);
  }
  const validationError = validateChatRequest(body);
  if (validationError) return response({ error: validationError }, 400);

  try {
    const client = createClient(
      requiredEnvironment('SUPABASE_URL'),
      requiredEnvironment('SUPABASE_ANON_KEY'),
      {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );

    let result;
    switch (body.action as ChatAction) {
      case 'create':
        result = await client.rpc('create_chat_invitation', {
          p_public_key: body.publicKey as string,
        });
        break;
      case 'join':
        result = await client.rpc('join_chat_invitation', {
          p_invitation_token: body.invitationToken as string,
          p_public_key: body.publicKey as string,
        });
        break;
      case 'status':
        result = await client.rpc('get_active_chat');
        break;
      case 'send':
        result = await client.rpc('send_chat_ciphertext', {
          p_room_id: body.roomId as string,
          p_client_message_id: body.clientMessageId as string,
          p_nonce: body.nonce as string,
          p_ciphertext: body.ciphertext as string,
        });
        break;
      case 'destroy':
        result = await client.rpc('destroy_chat_room', {
          p_room_id: body.roomId as string,
        });
        break;
    }

    if (result.error) {
      const message = result.error.message;
      if (/authentication|required|not_available/i.test(message)) {
        return response({ error: 'Chat is not available.' }, 403);
      }
      if (/rate_limit/i.test(message)) {
        return response({ error: 'Too many attempts. Try again later.' }, 429);
      }
      if (/invitation|room_full|active_chat/i.test(message)) {
        return response({ error: 'Chat invitation is unavailable.' }, 409);
      }
      return response({ error: 'Chat request could not be completed.' }, 400);
    }
    return response({ data: result.data });
  } catch (error) {
    // Deliberately log only the error class. Request bodies, identifiers,
    // tokens, public keys, nonces, and ciphertext never enter server logs.
    console.error(
      JSON.stringify({
        event: 'chat_request_failed',
        code: error instanceof Error ? error.name : 'unknown',
      }),
    );
    return response({ error: 'Chat service is unavailable.' }, 503);
  }
});
