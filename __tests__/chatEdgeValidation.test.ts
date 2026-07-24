import { validateChatRequest } from '../supabase/functions/chat-session/validation';

const publicKey = `${'A'.repeat(43)}=`;

describe('Chat Edge Function request boundary', () => {
  test('accepts legacy token joins and explicit token joins', () => {
    const invitationToken = 'a'.repeat(64);
    expect(
      validateChatRequest({
        action: 'join',
        invitationToken,
        publicKey,
      }),
    ).toBeUndefined();
    expect(
      validateChatRequest({
        action: 'join',
        invitationMethod: 'token',
        invitationToken,
        publicKey,
      }),
    ).toBeUndefined();
  });

  test('accepts only complete uppercase manual invitation codes', () => {
    expect(
      validateChatRequest({
        action: 'join',
        invitationMethod: 'code',
        invitationCode: 'ABCD-1234-EF56-7890',
        publicKey,
      }),
    ).toBeUndefined();
    expect(
      validateChatRequest({
        action: 'join',
        invitationMethod: 'code',
        invitationCode: 'ABCD-1234',
        publicKey,
      }),
    ).toBe('Invalid or expired private-chat code.');
  });

  test('does not allow one invitation representation to bypass another validator', () => {
    expect(
      validateChatRequest({
        action: 'join',
        invitationMethod: 'code',
        invitationToken: 'a'.repeat(64),
        publicKey,
      }),
    ).toBe('Invalid or expired private-chat code.');
    expect(
      validateChatRequest({
        action: 'join',
        invitationMethod: 'token',
        invitationCode: 'ABCD-1234-EF56-7890',
        publicKey,
      }),
    ).toBe('Invalid or expired private-chat invitation.');
  });

  test('rejects malformed keys and unsupported methods before database access', () => {
    expect(
      validateChatRequest({
        action: 'join',
        invitationMethod: 'circle',
        invitationToken: 'a'.repeat(64),
        publicKey,
      }),
    ).toBe('Invalid invitation method.');
    expect(
      validateChatRequest({
        action: 'join',
        invitationMethod: 'token',
        invitationToken: 'a'.repeat(64),
        publicKey: 'readable key',
      }),
    ).toBe('Invalid temporary public key.');
  });
});
