import type { ChatInvitation } from './types';
import { ChatError } from './types';

const CHAT_SCHEME = 'choosr:';
const CHAT_HOST = 'chat';
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const PUBLIC_KEY_PATTERN = /^[A-Za-z0-9+/]{43}=$/;

export type ScannedChatInvitation = Pick<
  ChatInvitation,
  'token' | 'creatorPublicKey'
>;

export function encodeChatInvitation(
  invitation: ScannedChatInvitation,
): string {
  const url = new URL(`${CHAT_SCHEME}//${CHAT_HOST}`);
  url.searchParams.set('v', '1');
  url.searchParams.set('t', invitation.token);
  url.searchParams.set('k', invitation.creatorPublicKey);
  return url.toString();
}

export function encodePrivateChatLink(
  invitation: ScannedChatInvitation,
): string {
  // A custom app URL is not fetched by web/link-preview services. When Choosr
  // has a verified public web domain, the same payload can move to an HTTPS
  // fragment without changing the invitation parser or backend contract.
  return encodeChatInvitation(invitation);
}

export function parseChatInvitation(value: string): ScannedChatInvitation {
  try {
    const url = new URL(value);
    const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));
    const parameters = url.search ? url.searchParams : fragment;
    const token = parameters.get('t') ?? '';
    const creatorPublicKey = parameters.get('k') ?? '';
    if (
      url.protocol !== CHAT_SCHEME ||
      url.hostname !== CHAT_HOST ||
      parameters.get('v') !== '1' ||
      !TOKEN_PATTERN.test(token) ||
      !PUBLIC_KEY_PATTERN.test(creatorPublicKey)
    ) {
      throw new Error('invalid');
    }
    return { token, creatorPublicKey };
  } catch {
    throw new ChatError(
      'invalid_invitation',
      'That is not a valid Choosr private-chat invitation.',
    );
  }
}

export function buildPrivateChatShareMessage(
  invitation: ScannedChatInvitation,
): { url: string; message: string } {
  const url = encodePrivateChatLink(invitation);
  return {
    url,
    message:
      `Join my private Choosr Chat. This invitation works once and expires in two minutes.\n\n${url}\n\n` +
      'If Choosr is not installed, install it first and ask me for a fresh invitation.',
  };
}
