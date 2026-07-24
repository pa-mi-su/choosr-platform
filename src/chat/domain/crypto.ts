import nacl from 'tweetnacl';
import {
  decodeBase64,
  decodeUTF8,
  encodeBase64,
  encodeUTF8,
} from 'tweetnacl-util';

import { ChatError, type TemporaryKeyPair } from './types';

export type EncryptedPayload = { nonce: string; ciphertext: string };

export function createTemporaryKeyPair(): TemporaryKeyPair {
  const pair = nacl.box.keyPair();
  return { publicKey: pair.publicKey, secretKey: pair.secretKey };
}

export function encodePublicKey(publicKey: Uint8Array): string {
  return encodeBase64(publicKey);
}

export function deriveSharedKey(
  peerPublicKey: string,
  ownSecretKey: Uint8Array,
): Uint8Array {
  try {
    const decodedPeerKey = decodeBase64(peerPublicKey);
    if (
      decodedPeerKey.length !== nacl.box.publicKeyLength ||
      ownSecretKey.length !== nacl.box.secretKeyLength
    ) {
      throw new Error('invalid key');
    }
    return nacl.box.before(decodedPeerKey, ownSecretKey);
  } catch {
    throw new ChatError(
      'encryption_failed',
      'The private chat key exchange could not be completed.',
    );
  }
}

export function encryptMessage(
  plaintext: string,
  sharedKey: Uint8Array,
): EncryptedPayload {
  if (!plaintext.trim() || sharedKey.length !== nacl.secretbox.keyLength) {
    throw new ChatError(
      'encryption_failed',
      'The message could not be encrypted.',
    );
  }
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const ciphertext = nacl.secretbox(decodeUTF8(plaintext), nonce, sharedKey);
  return {
    nonce: encodeBase64(nonce),
    ciphertext: encodeBase64(ciphertext),
  };
}

export function decryptMessage(
  payload: EncryptedPayload,
  sharedKey: Uint8Array,
): string {
  try {
    const plaintext = nacl.secretbox.open(
      decodeBase64(payload.ciphertext),
      decodeBase64(payload.nonce),
      sharedKey,
    );
    if (!plaintext) throw new Error('authentication failed');
    return encodeUTF8(plaintext);
  } catch {
    throw new ChatError(
      'decryption_failed',
      'An encrypted message could not be authenticated.',
    );
  }
}

export function createClientMessageId(): string {
  const bytes = nacl.randomBytes(16);
  bytes[6] = (bytes[6] % 16) + 64;
  bytes[8] = (bytes[8] % 64) + 128;
  const hex = Array.from(bytes, value =>
    value.toString(16).padStart(2, '0'),
  ).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

export function destroyKey(key: Uint8Array | undefined): void {
  key?.fill(0);
}
