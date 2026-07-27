import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  createClientMessageId,
  createTemporaryKeyPair,
  createSafetyNumber,
  decryptMessage,
  deriveSharedKey,
  destroyKey,
  encodePublicKey,
  encryptMessage,
} from '../domain/crypto';
import { parseChatInvitation } from '../domain/invitation';
import {
  ChatError,
  type ActiveChatState,
  type ChatInvitation,
  type LocalChatMessage,
  type PendingDecisionChatInvitation,
  type TemporaryKeyPair,
} from '../domain/types';
import type { ChatGateway } from './ChatGateway';

const PENDING_DESTRUCTION_KEY = 'choosr.chat.pending-destruction.v1';

type Runtime = {
  active: ActiveChatState;
  invitation?: ChatInvitation;
  ownUserId: string;
  keyPair: TemporaryKeyPair;
  sharedKey?: Uint8Array;
  messages: LocalChatMessage[];
};

export class ChatSession {
  private runtime?: Runtime;
  private orphanedChatWasDestroyed = false;
  private pendingReconciliation?: Promise<boolean>;

  constructor(private readonly gateway: ChatGateway) {}

  get active(): ActiveChatState | undefined {
    return this.runtime?.active;
  }

  get messages(): readonly LocalChatMessage[] {
    return this.runtime?.messages ?? [];
  }

  get invitation(): ChatInvitation | undefined {
    return this.runtime?.invitation;
  }

  get safetyNumber(): string | undefined {
    return this.runtime?.sharedKey
      ? createSafetyNumber(this.runtime.sharedKey)
      : undefined;
  }

  async create(ownUserId: string): Promise<ChatInvitation> {
    if (this.runtime) {
      throw new ChatError(
        'active_chat_exists',
        'End your current private chat before starting another.',
      );
    }
    const keyPair = createTemporaryKeyPair();
    try {
      const invitation = await this.gateway.createInvitation(
        encodePublicKey(keyPair.publicKey),
      );
      this.runtime = {
        ownUserId,
        keyPair,
        messages: [],
        invitation,
        active: {
          roomId: invitation.roomId,
          role: 'creator',
          status: 'inviting',
          expiresAt: invitation.roomExpiresAt,
          publicKey: invitation.creatorPublicKey,
        },
      };
      return invitation;
    } catch (error) {
      destroyKey(keyPair.secretKey);
      throw error;
    }
  }

  async join(ownUserId: string, encodedInvitation: string): Promise<void> {
    if (this.runtime) {
      throw new ChatError(
        'active_chat_exists',
        'End your current private chat before joining another.',
      );
    }
    const scanned = parseChatInvitation(encodedInvitation);
    const keyPair = createTemporaryKeyPair();
    let joinedRoomId: string | undefined;
    try {
      const active = await this.gateway.joinInvitation(
        scanned.token,
        encodePublicKey(keyPair.publicKey),
      );
      joinedRoomId = active.roomId;
      if (active.peerPublicKey !== scanned.creatorPublicKey) {
        throw new ChatError(
          'encryption_failed',
          'The invitation key did not match the room key.',
        );
      }
      this.runtime = {
        ownUserId,
        keyPair,
        messages: [],
        active,
        sharedKey: deriveSharedKey(scanned.creatorPublicKey, keyPair.secretKey),
      };
      await this.refreshMessages();
    } catch (error) {
      if (this.runtime?.active.roomId === joinedRoomId) this.destroyLocal();
      if (joinedRoomId) {
        try {
          await this.gateway.destroy(joinedRoomId);
        } catch {
          await this.addPendingDestruction(joinedRoomId);
        }
      }
      destroyKey(keyPair.secretKey);
      throw error;
    }
  }

  async openDecision(
    ownUserId: string,
    sessionId: string,
    peerDisplayName?: string,
  ): Promise<void> {
    if (this.runtime) {
      throw new ChatError(
        'active_chat_exists',
        'End your current private chat before starting another.',
      );
    }
    const keyPair = createTemporaryKeyPair();
    try {
      const active = await this.gateway.openDecisionChat(
        sessionId,
        encodePublicKey(keyPair.publicKey),
      );
      this.runtime = {
        ownUserId,
        keyPair,
        messages: [],
        active: { ...active, peerDisplayName },
        ...(active.peerPublicKey
          ? {
              sharedKey: deriveSharedKey(
                active.peerPublicKey,
                keyPair.secretKey,
              ),
            }
          : {}),
      };
      if (active.status === 'active') await this.refreshMessages();
    } catch (error) {
      destroyKey(keyPair.secretKey);
      throw error;
    }
  }

  async listPendingDecisionInvitations(): Promise<
    PendingDecisionChatInvitation[]
  > {
    return this.gateway.listPendingDecisionInvitations();
  }

  async declineDecisionInvitation(roomId: string): Promise<void> {
    await this.gateway.declineDecisionInvitation(roomId);
  }

  async refreshStatus(): Promise<'inviting' | 'active' | 'destroyed'> {
    const runtime = this.runtime;
    if (!runtime) return 'destroyed';
    const remote = await this.gateway.getActiveChat();
    if (!remote || remote.roomId !== runtime.active.roomId) {
      this.destroyLocal();
      return 'destroyed';
    }
    runtime.active = {
      ...remote,
      peerDisplayName: runtime.active.peerDisplayName,
    };
    if (remote.status === 'active') runtime.invitation = undefined;
    if (
      remote.status === 'active' &&
      remote.peerPublicKey &&
      !runtime.sharedKey
    ) {
      runtime.sharedKey = deriveSharedKey(
        remote.peerPublicKey,
        runtime.keyPair.secretKey,
      );
      await this.refreshMessages();
    }
    return remote.status;
  }

  async refreshMessages(): Promise<readonly LocalChatMessage[]> {
    const runtime = this.requireActiveRuntime();
    if (!runtime.sharedKey) return runtime.messages;
    const envelopes = await this.gateway.listMessages(runtime.active.roomId);
    runtime.messages = envelopes.map(envelope => ({
      id: String(envelope.id),
      text: decryptMessage(envelope, runtime.sharedKey as Uint8Array),
      sentByMe: envelope.senderUserId === runtime.ownUserId,
      createdAt: envelope.createdAt,
    }));
    return runtime.messages;
  }

  async send(plaintext: string): Promise<void> {
    const runtime = this.requireActiveRuntime();
    if (runtime.active.status !== 'active' || !runtime.sharedKey) {
      throw new ChatError('room_destroyed', 'This chat is not active.');
    }
    const clientMessageId = createClientMessageId();
    const encrypted = encryptMessage(plaintext, runtime.sharedKey);
    await this.gateway.sendCiphertext(
      runtime.active.roomId,
      clientMessageId,
      encrypted.nonce,
      encrypted.ciphertext,
    );
    await this.refreshMessages();
  }

  subscribe(onChange: () => void): { unsubscribe(): Promise<void> | void } {
    return this.gateway.subscribe(
      this.requireActiveRuntime().active.roomId,
      onChange,
    );
  }

  async destroy(): Promise<void> {
    const roomId = this.runtime?.active.roomId;
    this.destroyLocal();
    if (!roomId) return;
    try {
      await this.gateway.destroy(roomId);
      await this.removePendingDestruction(roomId);
    } catch (error) {
      await this.addPendingDestruction(roomId);
      throw error;
    }
  }

  async reconcileOrphanedRemoteChat(): Promise<boolean> {
    if (!this.pendingReconciliation) {
      this.pendingReconciliation = this.performReconciliation().finally(() => {
        this.pendingReconciliation = undefined;
      });
    }
    return this.pendingReconciliation;
  }

  private async performReconciliation(): Promise<boolean> {
    await this.flushPendingDestructions();
    const remote = await this.gateway.getActiveChat();
    if (!remote) return false;
    if (this.runtime?.active.roomId === remote.roomId) return true;
    // Temporary keys are intentionally not persisted. If the process was
    // killed, the ciphertext can no longer be decrypted, so close it rather
    // than leaving a misleading or recoverable shell.
    await this.gateway.destroy(remote.roomId);
    this.orphanedChatWasDestroyed = true;
    return false;
  }

  consumeOrphanedChatDestructionNotice(): boolean {
    const shouldNotify = this.orphanedChatWasDestroyed;
    this.orphanedChatWasDestroyed = false;
    return shouldNotify;
  }

  async hasRemoteChat(): Promise<boolean> {
    return Boolean(await this.gateway.getActiveChat());
  }

  destroyLocal(): void {
    if (!this.runtime) return;
    destroyKey(this.runtime.sharedKey);
    destroyKey(this.runtime.keyPair.secretKey);
    this.runtime.messages.splice(0);
    this.runtime = undefined;
  }

  private requireActiveRuntime(): Runtime {
    if (!this.runtime) {
      throw new ChatError(
        'room_destroyed',
        'This chat is no longer available.',
      );
    }
    return this.runtime;
  }

  private async readPendingDestructions(): Promise<string[]> {
    const raw = await AsyncStorage.getItem(PENDING_DESTRUCTION_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter(value => typeof value === 'string').slice(-10)
        : [];
    } catch {
      return [];
    }
  }

  private async addPendingDestruction(roomId: string): Promise<void> {
    const pending = await this.readPendingDestructions();
    await AsyncStorage.setItem(
      PENDING_DESTRUCTION_KEY,
      JSON.stringify([...new Set([...pending, roomId])]),
    );
  }

  private async removePendingDestruction(roomId: string): Promise<void> {
    const pending = (await this.readPendingDestructions()).filter(
      value => value !== roomId,
    );
    if (pending.length) {
      await AsyncStorage.setItem(
        PENDING_DESTRUCTION_KEY,
        JSON.stringify(pending),
      );
    } else {
      await AsyncStorage.removeItem(PENDING_DESTRUCTION_KEY);
    }
  }

  private async flushPendingDestructions(): Promise<void> {
    for (const roomId of await this.readPendingDestructions()) {
      try {
        await this.gateway.destroy(roomId);
        await this.removePendingDestruction(roomId);
      } catch {
        return;
      }
    }
  }
}
