import {
  createTemporaryKeyPair,
  decryptMessage,
  deriveSharedKey,
  destroyKey,
  encodePublicKey,
  encryptMessage,
} from '../src/chat/domain/crypto';
import {
  encodeChatInvitation,
  parseChatInvitation,
} from '../src/chat/domain/invitation';
import { ChatError, type ChatInvitation } from '../src/chat/domain/types';

describe('Choosr Chat cryptographic boundary', () => {
  test('two temporary devices derive the same key and exchange authenticated ciphertext', () => {
    const alice = createTemporaryKeyPair();
    const bob = createTemporaryKeyPair();
    const aliceShared = deriveSharedKey(
      encodePublicKey(bob.publicKey),
      alice.secretKey,
    );
    const bobShared = deriveSharedKey(
      encodePublicKey(alice.publicKey),
      bob.secretKey,
    );
    expect(Array.from(aliceShared)).toEqual(Array.from(bobShared));

    const plaintext = 'This text must exist only on the two devices.';
    const envelope = encryptMessage(plaintext, aliceShared);
    expect(envelope.ciphertext).not.toContain(plaintext);
    expect(JSON.stringify(envelope)).not.toContain(plaintext);
    expect(decryptMessage(envelope, bobShared)).toBe(plaintext);
  });

  test('tampering or a third device cannot decrypt a message', () => {
    const alice = createTemporaryKeyPair();
    const bob = createTemporaryKeyPair();
    const mallory = createTemporaryKeyPair();
    const envelope = encryptMessage(
      'private',
      deriveSharedKey(encodePublicKey(bob.publicKey), alice.secretKey),
    );
    const wrongKey = deriveSharedKey(
      encodePublicKey(alice.publicKey),
      mallory.secretKey,
    );
    expect(() => decryptMessage(envelope, wrongKey)).toThrow(ChatError);
  });

  test('temporary key bytes are overwritten during destruction', () => {
    const pair = createTemporaryKeyPair();
    destroyKey(pair.secretKey);
    expect(Array.from(pair.secretKey).every(byte => byte === 0)).toBe(true);
  });
});

describe('Choosr Chat QR contract', () => {
  const invitation: ChatInvitation = {
    roomId: 'not-encoded',
    token: 'a'.repeat(64),
    creatorPublicKey: `${'A'.repeat(43)}=`,
    invitationExpiresAt: '2026-07-24T12:01:30.000Z',
    roomExpiresAt: '2026-07-25T12:00:00.000Z',
  };

  test('QR encodes no room ID or profile identifier', () => {
    const encoded = encodeChatInvitation(invitation);
    expect(encoded).not.toContain(invitation.roomId);
    expect(parseChatInvitation(encoded)).toEqual({
      token: invitation.token,
      creatorPublicKey: invitation.creatorPublicKey,
    });
  });

  test.each([
    'https://example.com/chat',
    'choosr://chat?v=1&t=short&k=bad',
    `choosr://join?v=1&t=${'a'.repeat(64)}&k=${'A'.repeat(43)}=`,
  ])('rejects non-Choosr or malformed invitation %s', value => {
    expect(() => parseChatInvitation(value)).toThrow(ChatError);
  });
});
