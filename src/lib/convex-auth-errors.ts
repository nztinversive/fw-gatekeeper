export function normalizeConvexAuthError(message: string): string {
  const trimmed = message.trim();
  const redactedServerError = /\[Request ID:\s*[^\]]+\]\s*Server Error/i.test(trimmed);

  if (redactedServerError || /^Server Error$/i.test(trimmed)) {
    return 'Email or password was not accepted. Confirm this named portal account has been created, or use the PIN fallback for now.';
  }

  if (/Invalid credentials/i.test(trimmed)) {
    return 'Email or password was not accepted. Confirm the email and temporary password, or use the PIN fallback for now.';
  }

  return trimmed || 'Unable to authenticate. Use the PIN fallback for now.';
}
