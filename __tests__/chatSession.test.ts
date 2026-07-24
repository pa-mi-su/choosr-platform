import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ChatGateway } from '../src/chat/application/ChatGateway';
import { ChatSession } from '../src/chat/application/ChatSession';
import {
  createTemporaryKeyPair,
  encodePublicKey,
} from '../src/chat/domain/crypto';
import { encodeChatInvitation } from '../src/chat/domain/invitation';
import type { ActiveChatState, ChatEnvelope } from '../src/chat/domain/types';

class FakeGateway implements ChatGateway {
  active?: ActiveChatState;
  envelopes: ChatEnvelope[] = [];
  destroyFailure = false;
  destroyed: string[] = [];

  async createInvitation(publicKey: string) {
    this.active = {
      roomId: '10000000-0000-4000-8000-000000000001',
      role: 'creator' as const,
      status: 'inviting' as const,
      expiresAt: '2026-07-25T12:00:00.000Z',
      publicKey,
    };
    return {
      roomId: this.active.roomId,
      token: 'a'.repeat(64),
      manualCode: 'ABCD-1234-EF56-7890',
      creatorPublicKey: publicKey,
      invitationExpiresAt: '2026-07-24T12:01:30.000Z',
      roomExpiresAt: this.active.expiresAt,
    };
  }

  async joinInvitation(_token: string, publicKey: string) {
    if (!this.active?.publicKey) throw new Error('missing creator');
    return {
      roomId: this.active.roomId,
      role: 'joiner' as const,
      status: 'active' as const,
      expiresAt: this.active.expiresAt,
      publicKey,
      peerPublicKey: this.active.publicKey,
    };
  }

  async joinInvitationCode(_code: string, publicKey: string) {
    return this.joinInvitation('', publicKey);
  }

  async getActiveChat() {
    return this.active;
  }

  async listMessages() {
    return this.envelopes;
  }

  async sendCiphertext() {
    return { id: 1, createdAt: '2026-07-24T12:00:00.000Z' };
  }

  async destroy(roomId: string) {
    if (this.destroyFailure) throw new Error('offline');
    this.destroyed.push(roomId);
    this.active = undefined;
  }

  subscribe() {
    return { unsubscribe: () => undefined };
  }
}

describe('ChatSession lifecycle', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test('creator transitions from inviting to active only after peer key arrives', async () => {
    const gateway = new FakeGateway();
    const session = new ChatSession(gateway);
    await session.create('creator');
    expect(session.active?.status).toBe('inviting');

    gateway.active = {
      ...(gateway.active as ActiveChatState),
      status: 'active',
      peerPublicKey: encodePublicKey(createTemporaryKeyPair().publicKey),
    };
    expect(await session.refreshStatus()).toBe('active');
    expect(session.active?.peerPublicKey).toBeDefined();
  });

  test('local content and keys are purged immediately when offline destruction is queued', async () => {
    const gateway = new FakeGateway();
    const session = new ChatSession(gateway);
    await session.create('creator');
    gateway.destroyFailure = true;

    await expect(session.destroy()).rejects.toThrow('offline');
    expect(session.active).toBeUndefined();
    expect(session.messages).toEqual([]);
    expect(
      await AsyncStorage.getItem('choosr.chat.pending-destruction.v1'),
    ).toContain('10000000-0000-4000-8000-000000000001');

    gateway.destroyFailure = false;
    await session.reconcileOrphanedRemoteChat();
    expect(gateway.destroyed).toEqual(['10000000-0000-4000-8000-000000000001']);
    expect(
      await AsyncStorage.getItem('choosr.chat.pending-destruction.v1'),
    ).toBeNull();
  });

  test('a remote room without its memory-only key is destroyed on reconnect', async () => {
    const gateway = new FakeGateway();
    gateway.active = {
      roomId: '20000000-0000-4000-8000-000000000001',
      role: 'creator',
      status: 'active',
      expiresAt: '2026-07-25T12:00:00.000Z',
      publicKey: encodePublicKey(createTemporaryKeyPair().publicKey),
    };
    const session = new ChatSession(gateway);
    await expect(session.reconcileOrphanedRemoteChat()).resolves.toBe(false);
    expect(gateway.destroyed).toEqual(['20000000-0000-4000-8000-000000000001']);
  });

  test('a joined room is destroyed when the QR public key does not match', async () => {
    const gateway = new FakeGateway();
    const creatorKey = createTemporaryKeyPair();
    const tamperedKey = createTemporaryKeyPair();
    gateway.active = {
      roomId: '30000000-0000-4000-8000-000000000001',
      role: 'creator',
      status: 'inviting',
      expiresAt: '2026-07-25T12:00:00.000Z',
      publicKey: encodePublicKey(creatorKey.publicKey),
    };
    const invitation = encodeChatInvitation({
      token: 'b'.repeat(64),
      creatorPublicKey: encodePublicKey(tamperedKey.publicKey),
    });
    const session = new ChatSession(gateway);

    await expect(session.join('joiner', invitation)).rejects.toMatchObject({
      code: 'encryption_failed',
    });
    expect(gateway.destroyed).toEqual(['30000000-0000-4000-8000-000000000001']);
    expect(session.active).toBeUndefined();
  });

  test('manual code join derives the same safety number as the creator', async () => {
    const gateway = new FakeGateway();
    const creator = new ChatSession(gateway);
    const joiner = new ChatSession(gateway);
    const invitation = await creator.create('creator');

    await joiner.joinCode('joiner', invitation.manualCode);
    gateway.active = {
      ...(gateway.active as ActiveChatState),
      status: 'active',
      peerPublicKey: joiner.active?.publicKey,
    };
    await creator.refreshStatus();

    expect(joiner.safetyNumber).toMatch(/^\d{4} \d{4} \d{4}$/);
    expect(creator.safetyNumber).toBe(joiner.safetyNumber);
  });
});
