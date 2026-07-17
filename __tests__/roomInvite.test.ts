import { buildRoomInvite } from '../src/services/roomInvite';

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
