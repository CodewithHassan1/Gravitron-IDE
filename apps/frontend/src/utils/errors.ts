export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'GatewayNotConfiguredError') {
      return err.message;
    }

    // Check if it's a ConnectError network failure
    if (
      err.message.includes('fetch failed') ||
      err.message.includes('NetworkError') ||
      err.message.includes('Failed to fetch')
    ) {
      return 'Authentication service unavailable or network failure. Please try again.';
    }

    // ConnectError messages usually look like "[invalid_argument] Email and password required"
    // We want to strip the prefix
    const match = err.message.match(/^\[.*?\]\s*(.*)$/);
    if (match && match[1]) {
      return match[1];
    }
    return err.message;
  }

  if (typeof err === 'string') {
    return err;
  }

  return 'An unexpected error occurred. Please try again.';
}
