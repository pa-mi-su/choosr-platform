export type ServiceAccountIdentity = {
  client_email: string;
};

export type ServiceAccountClaims = {
  iss: string;
  scope: string;
  aud: string;
  iat: number;
  exp: number;
};

type OAuthTokenResponse = {
  access_token?: unknown;
  token_type?: unknown;
};

const firebaseMessagingScope =
  'https://www.googleapis.com/auth/firebase.messaging';
const googleOAuthTokenAudience = 'https://oauth2.googleapis.com/token';

export function buildServiceAccountClaims(
  account: ServiceAccountIdentity,
  issuedAt: number,
): ServiceAccountClaims {
  return {
    iss: account.client_email,
    scope: firebaseMessagingScope,
    aud: googleOAuthTokenAudience,
    iat: issuedAt,
    exp: issuedAt + 3600,
  };
}

export function readBearerAccessToken(result: OAuthTokenResponse): string {
  if (
    result.token_type !== 'Bearer' ||
    typeof result.access_token !== 'string' ||
    !result.access_token.trim()
  ) {
    throw new Error('Google OAuth returned an invalid access token.');
  }
  return result.access_token.trim();
}
