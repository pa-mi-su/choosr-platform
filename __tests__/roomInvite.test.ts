import { buildCircleInvite, buildRoomInvite } from '../src/services/roomInvite';

describe('buildRoomInvite', () => {
  it('includes a token link and a manual-code fallback', () => {
    const invite = buildRoomInvite({
      inviteToken: 'secret-token',
      accessCode: 'ABCD2345',
      decisionPrompt: 'choose a movie together',
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
    expect(invite.message).toContain('Pat invited you');
  });
});
