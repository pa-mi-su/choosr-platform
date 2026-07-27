const errorDetails = (error: unknown): { message: string; status?: number } => {
  if (!error || typeof error !== 'object') {
    return { message: error instanceof Error ? error.message : '' };
  }

  const message =
    'message' in error && typeof error.message === 'string'
      ? error.message
      : error instanceof Error
      ? error.message
      : '';
  const status =
    'status' in error && typeof error.status === 'number'
      ? error.status
      : undefined;
  return { message, status };
};

export function serviceFailureMessage(
  error: unknown,
  fallback: string,
): string {
  const { message, status } = errorDetails(error);

  if (
    /failed to fetch|network request failed|networkerror|load failed|enotfound|could not resolve|project.*paused|request_timeout|timed out/i.test(
      message,
    )
  ) {
    return 'Choosr could not reach its service. Check your connection and try again.';
  }

  if (
    status === 401 ||
    status === 403 ||
    /invalid.*jwt|jwt.*expired|refresh token/i.test(message)
  ) {
    return 'Your Choosr session could not be refreshed. Close and reopen the app, then try again.';
  }

  if (/PGRST202|could not find the function/i.test(message)) {
    return 'This Choosr build and service are out of sync. Update the app and try again.';
  }

  return fallback;
}
