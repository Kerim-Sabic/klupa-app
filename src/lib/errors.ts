/** Translation keys for the failures a coach can actually do something about. */
export type ErrorKey =
  | 'errors.offline'
  | 'errors.forbidden'
  | 'errors.rateLimited'
  | 'errors.duplicate'
  | 'errors.invalid'
  | 'errors.unknown';

function codeOf(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return typeof error.code === 'string' ? error.code : null;
  }
  return null;
}

/**
 * Map any thrown value to a message key. Database error codes are stable
 * (they are raised deliberately in the migrations), so the mapping is exact
 * and no raw server text is ever shown to the user.
 */
export function errorKey(error: unknown): ErrorKey {
  if (error instanceof TypeError || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return 'errors.offline';
  }
  switch (codeOf(error)) {
    case '42501':
    case 'PGRST301':
      return 'errors.forbidden';
    case '54000':
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'errors.rateLimited';
    case '23505':
      return 'errors.duplicate';
    case '23514':
    case '23503':
    case '22P02':
    case 'otp_expired':
    case 'validation_failed':
      return 'errors.invalid';
    default:
      return 'errors.unknown';
  }
}
