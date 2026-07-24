import { validateChatRequest } from '../supabase/functions/chat-session/validation';

const publicKey = `${'A'.repeat(43)}=`;

describe('Chat Edge Function request boundary', () => {
  test('accepts complete token joins', () => {
    const invitationToken = 'a'.repeat(64);
    expect(
      validateChatRequest({
        action: 'join',
        invitationToken,
        publicKey,
      }),
    ).toBeUndefined();
  });

  test('rejects missing and malformed invitation tokens', () => {
    expect(
      validateChatRequest({
        action: 'join',
        publicKey,
      }),
    ).toBe('Invalid or expired private-chat invitation.');
    expect(
      validateChatRequest({
        action: 'join',
        invitationToken: 'too-short',
        publicKey,
      }),
    ).toBe('Invalid or expired private-chat invitation.');
  });

  test('rejects malformed keys before database access', () => {
    expect(
      validateChatRequest({
        action: 'join',
        invitationToken: 'a'.repeat(64),
        publicKey: 'readable key',
      }),
    ).toBe('Invalid temporary public key.');
  });
});
