import { normalizeFcmFailure } from '../supabase/functions/dispatch-notifications/fcmError';

describe('FCM error boundary', () => {
  test('keeps only canonical provider codes and identifies stale tokens', () => {
    const failure = normalizeFcmFailure(
      404,
      JSON.stringify({
        error: {
          status: 'NOT_FOUND',
          message: 'Sensitive provider detail',
          details: [{ errorCode: 'UNREGISTERED' }],
        },
      }),
    );

    expect(failure).toEqual({
      code: 'FCM_404_UNREGISTERED',
      invalidToken: true,
    });
    expect(JSON.stringify(failure)).not.toContain('Sensitive');
  });

  test('does not retain an unstructured provider response', () => {
    expect(
      normalizeFcmFailure(503, 'gateway request included a token'),
    ).toEqual({
      code: 'FCM_503_UNKNOWN',
      invalidToken: false,
    });
  });

  test('does not delete a token for a generic invalid payload', () => {
    expect(
      normalizeFcmFailure(
        400,
        JSON.stringify({ error: { status: 'INVALID_ARGUMENT' } }),
      ),
    ).toEqual({
      code: 'FCM_400_INVALID_ARGUMENT',
      invalidToken: false,
    });
  });
});
