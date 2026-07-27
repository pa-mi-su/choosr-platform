export class RequestTimeoutError extends Error {
  readonly code = 'request_timeout';

  constructor(
    readonly operation: string,
    readonly timeoutMilliseconds: number,
  ) {
    super(`${operation} timed out after ${timeoutMilliseconds}ms.`);
    this.name = 'RequestTimeoutError';
  }
}

export type ResilientRequestOptions = {
  operation: string;
  timeoutMilliseconds: number;
  attempts?: number;
  backoffMilliseconds?: number;
};

export function isTransientNetworkFailure(error: unknown): boolean {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String(error.message)
      : error instanceof Error
      ? error.message
      : '';
  const status =
    error && typeof error === 'object' && 'status' in error
      ? Number(error.status)
      : error &&
        typeof error === 'object' &&
        'context' in error &&
        error.context &&
        typeof error.context === 'object' &&
        'status' in error.context
      ? Number(error.context.status)
      : undefined;
  return (
    error instanceof RequestTimeoutError ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    (status !== undefined && status >= 500) ||
    /abort|failed to fetch|failed to send|network request failed|networkerror|load failed|enotfound|could not resolve|timed out|timeout|connection.*lost|offline/i.test(
      message,
    )
  );
}

const wait = (milliseconds: number) =>
  new Promise<void>(resolve => setTimeout(resolve, milliseconds));

export async function withResilientRequest<T>(
  requestFactory: (signal: AbortSignal) => PromiseLike<T>,
  options: ResilientRequestOptions,
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 1);
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve(requestFactory(controller.signal)),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(
              new RequestTimeoutError(
                options.operation,
                options.timeoutMilliseconds,
              ),
            );
          }, options.timeoutMilliseconds);
        }),
      ]);
    } catch (error) {
      lastError = error;
      if (attempt + 1 >= attempts || !isTransientNetworkFailure(error)) {
        throw error;
      }
      await wait((options.backoffMilliseconds ?? 300) * 2 ** attempt);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  throw lastError;
}

export async function withSupabaseReadRetry<T extends { error: unknown }>(
  requestFactory: (signal: AbortSignal) => PromiseLike<T>,
  options: Omit<ResilientRequestOptions, 'attempts'> & {
    attempts?: number;
  },
): Promise<T> {
  return withResilientRequest(
    async signal => {
      const result = await requestFactory(signal);
      if (result.error && isTransientNetworkFailure(result.error)) {
        throw result.error;
      }
      return result;
    },
    {
      ...options,
      attempts: options.attempts ?? 2,
    },
  );
}

export function createTimedFetch(
  fetchImplementation: typeof fetch,
  timeoutMilliseconds: number,
): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const callerSignal = init?.signal;
    const abortFromCaller = () => controller.abort();
    if (callerSignal?.aborted) {
      controller.abort();
    } else {
      callerSignal?.addEventListener('abort', abortFromCaller);
    }
    const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);
    try {
      return await fetchImplementation(input, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
      callerSignal?.removeEventListener('abort', abortFromCaller);
    }
  };
}

export async function withRequestTimeout<T>(
  request: PromiseLike<T>,
  timeoutMilliseconds: number,
  operation: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new RequestTimeoutError(operation, timeoutMilliseconds)),
          timeoutMilliseconds,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
