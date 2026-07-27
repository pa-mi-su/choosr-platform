export type FcmFailure = {
  code: string;
  invalidToken: boolean;
};

const safeCode = (value: unknown): string | undefined =>
  typeof value === 'string' && /^[A-Z0-9_.-]{1,80}$/i.test(value)
    ? value.toUpperCase()
    : undefined;

export function normalizeFcmFailure(
  status: number,
  responseText: string,
): FcmFailure {
  let statusCode: string | undefined;
  let fcmCode: string | undefined;
  try {
    const body = JSON.parse(responseText) as {
      error?: {
        status?: unknown;
        details?: Array<{ errorCode?: unknown }>;
      };
    };
    statusCode = safeCode(body.error?.status);
    fcmCode = body.error?.details
      ?.map(detail => safeCode(detail.errorCode))
      .find(Boolean);
  } catch {
    // The provider body is intentionally discarded. Only canonical codes are
    // retained so credentials, tokens, and request details cannot reach logs.
  }
  const code = fcmCode ?? statusCode ?? 'UNKNOWN';
  return {
    code: `FCM_${status}_${code}`,
    // A generic HTTP 404 can be caused by the project, endpoint, or API route.
    // Only FCM's canonical per-token code proves this installation is invalid.
    invalidToken: fcmCode === 'UNREGISTERED',
  };
}
