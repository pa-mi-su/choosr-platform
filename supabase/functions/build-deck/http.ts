export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export const fetchWithTimeout = (
  input: string | URL,
  init: RequestInit,
  timeoutMilliseconds = 8000,
) =>
  fetch(input, {
    ...init,
    signal: AbortSignal.timeout(timeoutMilliseconds),
  });
