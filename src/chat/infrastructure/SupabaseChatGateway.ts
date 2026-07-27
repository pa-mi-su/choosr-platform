import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '../../lib/supabase';
import {
  isTransientNetworkFailure,
  withResilientRequest,
  withSupabaseReadRetry,
} from '../../services/requestTimeout';
import type { ChatGateway } from '../application/ChatGateway';
import { ChatError } from '../domain/types';
import type {
  ActiveChatState,
  ChatEnvelope,
  ChatInvitation,
  ChatRole,
  ChatRoomStatus,
} from '../domain/types';

type FunctionResponse<T> = { data: T };

type CreateRow = {
  room_id: string;
  invitation_token: string;
  invitation_expires_at: string;
  room_expires_at: string;
};
type ActiveRow = {
  room_id: string;
  status: ChatRoomStatus;
  role: ChatRole;
  own_public_key: string;
  peer_public_key: string | null;
  room_expires_at: string;
  decision_session_id: string | null;
};
type JoinRow = {
  room_id: string;
  peer_public_key: string;
  room_expires_at: string;
};

function first<T>(value: T[] | T | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

function mapFailure(error: unknown): ChatError {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String(error.message)
      : '';
  if (/invitation|not available|unavailable|conflict|409/i.test(message)) {
    return new ChatError(
      'invitation_unavailable',
      'That private-chat invitation has expired or was already used.',
    );
  }
  if (/active_chat/i.test(message)) {
    return new ChatError(
      'active_chat_exists',
      'End your current private chat before starting another.',
    );
  }
  if (/network|fetch|timeout/i.test(message)) {
    return new ChatError(
      'network',
      'Choosr could not reach the private chat service.',
    );
  }
  return new ChatError('unknown', 'The private chat request failed.');
}

export class SupabaseChatGateway implements ChatGateway {
  async createInvitation(publicKey: string): Promise<ChatInvitation> {
    const row = first(await this.invoke<CreateRow[]>('create', { publicKey }));
    if (!row) throw new ChatError('unknown', 'No chat invitation was created.');
    return {
      roomId: row.room_id,
      token: row.invitation_token,
      creatorPublicKey: publicKey,
      invitationExpiresAt: row.invitation_expires_at,
      roomExpiresAt: row.room_expires_at,
    };
  }

  async joinInvitation(
    invitationToken: string,
    publicKey: string,
  ): Promise<ActiveChatState> {
    const row = first(
      await this.invoke<JoinRow[]>('join', {
        invitationToken,
        publicKey,
      }),
    );
    if (!row) {
      throw new ChatError(
        'invitation_unavailable',
        'That private-chat invitation is unavailable.',
      );
    }
    return {
      roomId: row.room_id,
      role: 'joiner',
      status: 'active',
      publicKey,
      peerPublicKey: row.peer_public_key,
      expiresAt: row.room_expires_at,
    };
  }

  async openDecisionChat(
    sessionId: string,
    publicKey: string,
  ): Promise<ActiveChatState> {
    const row = first(
      await this.invoke<ActiveRow[]>('openDecision', {
        sessionId,
        publicKey,
      }),
    );
    if (!row) {
      throw new ChatError(
        'invitation_unavailable',
        'That matched private chat is unavailable.',
      );
    }
    return {
      roomId: row.room_id,
      role: row.role,
      status: row.status,
      publicKey,
      peerPublicKey: row.peer_public_key ?? undefined,
      decisionSessionId: row.decision_session_id ?? undefined,
      expiresAt: row.room_expires_at,
    };
  }

  async getActiveChat(): Promise<ActiveChatState | undefined> {
    const row = first(await this.invoke<ActiveRow[]>('status', {}));
    if (!row) return undefined;
    return {
      roomId: row.room_id,
      role: row.role,
      status: row.status,
      publicKey: row.own_public_key,
      peerPublicKey: row.peer_public_key ?? undefined,
      decisionSessionId: row.decision_session_id ?? undefined,
      expiresAt: row.room_expires_at,
    };
  }

  async listMessages(roomId: string): Promise<ChatEnvelope[]> {
    const { data, error } = await withSupabaseReadRetry(
      signal =>
        supabase
          .from('chat_messages')
          .select(
            'id,room_id,sender_user_id,client_message_id,nonce,ciphertext,created_at',
          )
          .eq('room_id', roomId)
          .order('id', { ascending: true })
          .limit(500)
          .abortSignal(signal),
      {
        operation: 'Private chat messages',
        timeoutMilliseconds: 7_000,
        backoffMilliseconds: 250,
      },
    );
    if (error) throw mapFailure(error);
    return (data ?? []).map(row => ({
      id: row.id,
      roomId: row.room_id,
      senderUserId: row.sender_user_id,
      clientMessageId: row.client_message_id,
      nonce: row.nonce,
      ciphertext: row.ciphertext,
      createdAt: row.created_at,
    }));
  }

  async sendCiphertext(
    roomId: string,
    clientMessageId: string,
    nonce: string,
    ciphertext: string,
  ): Promise<{ id: number; createdAt: string }> {
    const row = first(
      await this.invoke<{ message_id: number; created_at: string }[]>('send', {
        roomId,
        clientMessageId,
        nonce,
        ciphertext,
      }),
    );
    if (!row) throw new ChatError('unknown', 'The message was not accepted.');
    return { id: row.message_id, createdAt: row.created_at };
  }

  async destroy(roomId: string): Promise<void> {
    await this.invoke<string>('destroy', { roomId });
  }

  subscribe(
    roomId: string,
    onChange: () => void,
  ): { unsubscribe(): Promise<void> } {
    const channel: RealtimeChannel = supabase
      .channel(`chat-room:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
          filter: `room_id=eq.${roomId}`,
        },
        onChange,
      )
      .subscribe();
    return {
      unsubscribe: async () => {
        await supabase.removeChannel(channel);
      },
    };
  }

  private async invoke<T>(
    action: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const attempts = ['status', 'send', 'destroy'].includes(action) ? 2 : 1;
    let response: {
      data: FunctionResponse<T> | null;
      error: unknown;
    };
    try {
      response = await withResilientRequest(
        async signal => {
          const result = await supabase.functions.invoke<FunctionResponse<T>>(
            'chat-session',
            {
              body: { action, ...body },
              signal,
              timeout: 7_000,
            },
          );
          if (result.error && isTransientNetworkFailure(result.error)) {
            throw result.error;
          }
          return result;
        },
        {
          operation: `Private chat ${action}`,
          timeoutMilliseconds: 7_500,
          attempts,
          backoffMilliseconds: 250,
        },
      );
    } catch (cause) {
      throw mapFailure(cause);
    }
    const { data, error: responseError } = response;
    if (responseError) throw mapFailure(responseError);
    if (!data || !('data' in data)) {
      throw new ChatError('unknown', 'The chat service returned no result.');
    }
    return data.data;
  }
}
