import type {
  ActiveChatState,
  ChatEnvelope,
  ChatInvitation,
  PendingDecisionChatInvitation,
} from '../domain/types';

export interface ChatGateway {
  createInvitation(publicKey: string): Promise<ChatInvitation>;
  joinInvitation(
    invitationToken: string,
    publicKey: string,
  ): Promise<ActiveChatState>;
  openDecisionChat(
    sessionId: string,
    publicKey: string,
  ): Promise<ActiveChatState>;
  listPendingDecisionInvitations(): Promise<PendingDecisionChatInvitation[]>;
  declineDecisionInvitation(roomId: string): Promise<void>;
  getActiveChat(): Promise<ActiveChatState | undefined>;
  listMessages(roomId: string): Promise<ChatEnvelope[]>;
  sendCiphertext(
    roomId: string,
    clientMessageId: string,
    nonce: string,
    ciphertext: string,
  ): Promise<{ id: number; createdAt: string }>;
  destroy(roomId: string): Promise<void>;
  subscribe(
    roomId: string,
    onChange: () => void,
  ): { unsubscribe(): Promise<void> | void };
}
