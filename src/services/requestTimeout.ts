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
