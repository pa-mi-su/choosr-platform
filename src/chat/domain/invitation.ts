import type { ChatInvitation } from './types';
import { ChatError } from './types';

const CHAT_QR_SCHEME = 'choosr:';
const CHAT_QR_HOST = 'chat';
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const PUBLIC_KEY_PATTERN = /^[A-Za-z0-9+/]{43}=$/;

export type ScannedChatInvitation = Pick<
  ChatInvitation,
  'token' | 'creatorPublicKey'
>;

export function encodeChatInvitation(
  invitation: ScannedChatInvitation,
): string {
  const url = new URL(`${CHAT_QR_SCHEME}//${CHAT_QR_HOST}`);
  url.searchParams.set('v', '1');
  url.searchParams.set('t', invitation.token);
  url.searchParams.set('k', invitation.creatorPublicKey);
  return url.toString();
}

export function parseChatInvitation(value: string): ScannedChatInvitation {
  try {
    const url = new URL(value);
    const token = url.searchParams.get('t') ?? '';
    const creatorPublicKey = url.searchParams.get('k') ?? '';
    if (
      url.protocol !== CHAT_QR_SCHEME ||
      url.hostname !== CHAT_QR_HOST ||
      url.searchParams.get('v') !== '1' ||
      !TOKEN_PATTERN.test(token) ||
      !PUBLIC_KEY_PATTERN.test(creatorPublicKey)
    ) {
      throw new Error('invalid');
    }
    return { token, creatorPublicKey };
  } catch {
    throw new ChatError(
      'invalid_invitation',
      'That is not a valid Choosr Chat QR code.',
    );
  }
}
