type AdminControlErrorPayload = {
  code?: string;
};

function formatRetryAfter(value: string | null) {
  const seconds = Number.parseInt(value || '', 10);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 'Please wait before trying again.';
  }

  if (seconds >= 60) {
    const minutes = Math.ceil(seconds / 60);
    return `Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`;
  }

  return `Try again in ${seconds} seconds.`;
}

export function getSystemControlErrorMessage(
  response: Pick<Response, 'status' | 'headers'>,
  payload: AdminControlErrorPayload,
  fallback: string
) {
  switch (payload.code) {
    case 'LAST_ACTIVE_SUPER_ADMIN':
      return 'At least one active Super Admin must remain.';
    case 'SELF_DEMOTION_BLOCKED':
      return 'You cannot demote or deactivate your own Super Admin account.';
    case 'RATE_LIMITED':
      return `Too many requests. ${formatRetryAfter(response.headers.get('Retry-After'))}`;
    case 'CONFLICT':
      return 'This account changed while you were working. Refresh the directory and try again.';
    case 'FORBIDDEN':
      return 'You do not have permission to perform this action.';
    case 'VALIDATION_ERROR':
      return 'Check the submitted account details and try again.';
    default:
      return response.status === 429
        ? `Too many requests. ${formatRetryAfter(response.headers.get('Retry-After'))}`
        : fallback;
  }
}
