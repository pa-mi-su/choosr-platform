export type ChatRole = 'creator' | 'joiner';
export type ChatRoomStatus = 'inviting' | 'active';

export type ChatInvitation = {
  roomId: string;
  token: string;
  creatorPublicKey: string;
  invitationExpiresAt: string;
  roomExpiresAt: string;
};

export type ChatEnvelope = {
  id: number;
  roomId: string;
  senderUserId: string;
  clientMessageId: string;
  nonce: string;
  ciphertext: string;
  createdAt: string;
};

export type LocalChatMessage = {
  id: string;
  text: string;
  sentByMe: boolean;
  createdAt: string;
};

export type ActiveChatState = {
  roomId: string;
  role: ChatRole;
  status: ChatRoomStatus;
  expiresAt: string;
  publicKey: string;
  peerPublicKey?: string;
  decisionSessionId?: string;
  peerDisplayName?: string;
};

export type PendingDecisionChatInvitation = {
  roomId: string;
  decisionSessionId: string;
  inviterDisplayName: string;
  inviterPhotoUrl: string | null;
  matchedItemTitle: string;
  createdAt: string;
  expiresAt: string;
};

export type TemporaryKeyPair = {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
};

export class ChatError extends Error {
  constructor(
    public readonly code:
      | 'invalid_invitation'
      | 'invitation_unavailable'
      | 'active_chat_exists'
      | 'encryption_failed'
      | 'decryption_failed'
      | 'room_destroyed'
      | 'network'
      | 'camera_denied'
      | 'unknown',
    message: string,
  ) {
    super(message);
    this.name = 'ChatError';
  }
}
