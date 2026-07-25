import {
  createTimedFetch,
  isTransientNetworkFailure,
  RequestTimeoutError,
  withResilientRequest,
} from '../src/services/requestTimeout';

describe('weak-network request policy', () => {
  test('retries transient read failures and returns the recovered response', async () => {
    const request = jest
      .fn()
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce('recovered');

    await expect(
      withResilientRequest(() => request(), {
        operation: 'test read',
        timeoutMilliseconds: 1_000,
        attempts: 2,
        backoffMilliseconds: 0,
      }),
    ).resolves.toBe('recovered');
    expect(request).toHaveBeenCalledTimes(2);
  });

  test('does not retry authorization or validation failures', async () => {
    const error = { message: 'JWT expired', status: 401 };
    const request = jest.fn().mockRejectedValue(error);

    await expect(
      withResilientRequest(() => request(), {
        operation: 'test read',
        timeoutMilliseconds: 1_000,
        attempts: 3,
        backoffMilliseconds: 0,
      }),
    ).rejects.toBe(error);
    expect(request).toHaveBeenCalledTimes(1);
  });

  test('aborts a fetch that exceeds its hard network budget', async () => {
    jest.useFakeTimers();
    const fetchImplementation = jest.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          );
        }),
    );
    const timedFetch = createTimedFetch(fetchImplementation, 50);
    const response = timedFetch('https://example.com');
    await Promise.all([
      expect(response).rejects.toThrow('aborted'),
      jest.advanceTimersByTimeAsync(50),
    ]);
    jest.useRealTimers();
  });

  test('recognizes timeouts and server failures as transient', () => {
    expect(isTransientNetworkFailure(new RequestTimeoutError('test', 1))).toBe(
      true,
    );
    expect(
      isTransientNetworkFailure({ message: 'unavailable', status: 503 }),
    ).toBe(true);
    expect(
      isTransientNetworkFailure({
        message: 'Edge Function returned a non-2xx status code',
        context: { status: 503 },
      }),
    ).toBe(true);
    expect(
      isTransientNetworkFailure({ message: 'forbidden', status: 403 }),
    ).toBe(false);
  });
});
