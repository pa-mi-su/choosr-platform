export type ChatAction = 'create' | 'join' | 'status' | 'send' | 'destroy';

export type ChatRequestBody = {
  action?: unknown;
  roomId?: unknown;
  invitationToken?: unknown;
  invitationCode?: unknown;
  invitationMethod?: unknown;
  publicKey?: unknown;
  clientMessageId?: unknown;
  nonce?: unknown;
  ciphertext?: unknown;
};

const base64Key = /^[A-Za-z0-9+/]{43}=$/;
const base64Nonce = /^[A-Za-z0-9+/]{32}$/;
const base64Ciphertext = /^[A-Za-z0-9+/]+={0,2}$/;
const hexToken = /^[0-9a-f]{64}$/;
const manualCode = /^[0-9A-F]{4}(?:-[0-9A-F]{4}){3}$/;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isChatAction(value: unknown): value is ChatAction {
  return (
    value === 'create' ||
    value === 'join' ||
    value === 'status' ||
    value === 'send' ||
    value === 'destroy'
  );
}

export function validateChatRequest(body: ChatRequestBody): string | undefined {
  if (!isChatAction(body.action)) return 'Unsupported chat action.';
  if (
    (body.action === 'create' || body.action === 'join') &&
    (typeof body.publicKey !== 'string' || !base64Key.test(body.publicKey))
  ) {
    return 'Invalid temporary public key.';
  }
  if (
    body.action === 'join' &&
    body.invitationMethod !== undefined &&
    body.invitationMethod !== 'token' &&
    body.invitationMethod !== 'code'
  ) {
    return 'Invalid invitation method.';
  }
  if (
    body.action === 'join' &&
    (body.invitationMethod === undefined ||
      body.invitationMethod === 'token') &&
    (typeof body.invitationToken !== 'string' ||
      !hexToken.test(body.invitationToken))
  ) {
    return 'Invalid or expired private-chat invitation.';
  }
  if (
    body.action === 'join' &&
    body.invitationMethod === 'code' &&
    (typeof body.invitationCode !== 'string' ||
      !manualCode.test(body.invitationCode))
  ) {
    return 'Invalid or expired private-chat code.';
  }
  if (
    (body.action === 'send' || body.action === 'destroy') &&
    (typeof body.roomId !== 'string' || !uuid.test(body.roomId))
  ) {
    return 'Invalid chat room.';
  }
  if (
    body.action === 'send' &&
    (typeof body.clientMessageId !== 'string' ||
      !uuid.test(body.clientMessageId) ||
      typeof body.nonce !== 'string' ||
      !base64Nonce.test(body.nonce) ||
      typeof body.ciphertext !== 'string' ||
      body.ciphertext.length < 24 ||
      body.ciphertext.length > 16384 ||
      !base64Ciphertext.test(body.ciphertext))
  ) {
    return 'Invalid encrypted message envelope.';
  }
  return undefined;
}
