import { serviceFailureMessage } from '../src/services/serviceError';

describe('serviceFailureMessage', () => {
  it('explains backend network failures instead of showing a generic action error', () => {
    expect(
      serviceFailureMessage(
        new TypeError('Network request failed'),
        'Fallback message',
      ),
    ).toContain('could not reach its service');
  });

  it('explains an expired authenticated session', () => {
    expect(
      serviceFailureMessage(
        { message: 'JWT expired', status: 401 },
        'Fallback message',
      ),
    ).toContain('session could not be refreshed');
  });

  it('explains a build/backend schema mismatch', () => {
    expect(
      serviceFailureMessage(
        new Error('PGRST202 Could not find the function public.list_circle'),
        'Fallback message',
      ),
    ).toContain('out of sync');
  });

  it('preserves the screen-specific fallback for other failures', () => {
    expect(
      serviceFailureMessage(new Error('unexpected'), 'Fallback message'),
    ).toBe('Fallback message');
  });
});
