import {
  buildServiceAccountClaims,
  readBearerAccessToken,
} from '../supabase/functions/dispatch-notifications/googleAuth';

describe('Firebase service-account authentication', () => {
  it('creates an app-level OAuth assertion without impersonating a user', () => {
    const claims = buildServiceAccountClaims(
      { client_email: 'push@example.iam.gserviceaccount.com' },
      1_700_000_000,
    );

    expect(claims).toEqual({
      iss: 'push@example.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    });
    expect(claims).not.toHaveProperty('sub');
  });

  it('accepts only a non-empty Bearer access token', () => {
    expect(
      readBearerAccessToken({
        token_type: 'Bearer',
        access_token: '  access-token  ',
      }),
    ).toBe('access-token');

    expect(() =>
      readBearerAccessToken({
        token_type: 'bearer',
        access_token: 'access-token',
      }),
    ).toThrow('Google OAuth returned an invalid access token.');
  });
});
