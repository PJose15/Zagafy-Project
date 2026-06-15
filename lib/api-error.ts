/** Extract an HTTP status code from an unknown error object, defaulting to 500. */
export function getErrorStatus(error: unknown): number {
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status: unknown }).status === 'number'
  ) {
    const status = (error as { status: number }).status;
    if (status >= 400 && status < 600) return status;
  }
  return 500;
}

/** Extract a human-readable message from an unknown error, with an optional fallback. */
export function getErrorMessage(error: unknown, fallback = 'An unexpected error occurred'): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return fallback;
}
