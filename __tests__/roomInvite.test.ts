import {
  buildCircleInvite,
  buildNativeSharePayload,
  buildRoomInvite,
} from '../src/services/roomInvite';

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
      'Pat invited you to join their Choosr Circle.\n\n' +
        'Connect and start choosing together:\n' +
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

    expect(buildNativeSharePayload('Connect on Choosr', invite)).toEqual({
      title: 'Connect on Choosr',
      message: invite.message,
    });
    expect(
      buildNativeSharePayload('Connect on Choosr', invite),
    ).not.toHaveProperty('url');
  });
});
