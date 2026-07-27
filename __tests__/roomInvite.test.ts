import {
  buildCircleInvite,
  buildNativeSharePayload,
  buildRoomInvite,
} from '../src/services/roomInvite';
import { buildPrivateChatShareMessage } from '../src/chat/domain/invitation';

describe('buildRoomInvite', () => {
  it('includes a token link and a manual-code fallback', () => {
    const invite = buildRoomInvite({
      inviteToken: 'secret-token',
      accessCode: 'ABCD2345',
      decisionPrompt: 'choose dinner together',
    });

    expect(invite.url).toBe('choosr://join/secret-token');
    expect(invite.message).toContain('choosr://join/secret-token');
    expect(invite.message).toContain('ABCD2345');
  });

  it('encodes tokens before placing them in a URL', () => {
    expect(
      buildRoomInvite({
        inviteToken: 'token/value',
        accessCode: 'ABCD2345',
        decisionPrompt: 'decide',
      }).url,
    ).toBe('choosr://join/token%2Fvalue');
  });
});

describe('buildCircleInvite', () => {
  it('builds a secure connection link for native sharing', () => {
    const invite = buildCircleInvite({
      inviteToken: 'circle-token',
      displayName: 'Pat',
    });

    expect(invite.url).toBe('choosr://connect/circle-token');
    expect(invite.message).toBe(
      'CHOOSR · CIRCLE INVITATION\n\n' +
        'Pat wants to connect with you.\n\n' +
        'Join their Choosr Circle and start choosing together:\n' +
        'choosr://connect/circle-token',
    );
    expect(
      invite.message.match(/choosr:\/\/connect\/circle-token/g),
    ).toHaveLength(1);
  });

  it('gives native sharing one branded message instead of a duplicate URL', () => {
    const invite = buildCircleInvite({
      inviteToken: 'circle-token',
      displayName: 'Pat',
    });

    expect(
      buildNativeSharePayload('Choosr · Circle invitation', invite),
    ).toEqual({
      title: 'Choosr · Circle invitation',
      message: invite.message,
    });
    expect(
      buildNativeSharePayload('Choosr · Circle invitation', invite),
    ).not.toHaveProperty('url');
  });
});

describe('cross-platform Choosr sharing', () => {
  it('keeps Circle, decision-room, and private-chat invitations distinct', () => {
    const circle = buildNativeSharePayload(
      'Choosr · Circle invitation',
      buildCircleInvite({
        inviteToken: 'circle-token',
        displayName: 'Pat',
      }),
    );
    const room = buildNativeSharePayload(
      'Choosr · Room invitation',
      buildRoomInvite({
        inviteToken: 'room-token',
        accessCode: 'ABCD2345',
        decisionPrompt: 'pick dinner',
      }),
    );
    const chat = buildNativeSharePayload(
      'Choosr · Private chat',
      buildPrivateChatShareMessage({
        token: 'a'.repeat(64),
        creatorPublicKey: `${'A'.repeat(43)}=`,
      }),
    );

    expect(new Set([circle.title, room.title, chat.title]).size).toBe(3);
    expect(new Set([circle.message, room.message, chat.message]).size).toBe(3);
    expect(circle.message).toContain('Choosr Circle');
    expect(room.message).toContain('ROOM INVITATION');
    expect(room.message).toContain('ABCD2345');
    expect(chat.message).toContain('private Choosr Chat');
    expect(chat.message).toContain('works once');
    expect(chat.message).toContain('90 seconds');

    for (const payload of [circle, room, chat]) {
      expect(payload).not.toHaveProperty('url');
      expect(payload.message.match(/choosr:\/\//g)).toHaveLength(1);
    }
  });
});
