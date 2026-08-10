export function normalizeConvexAuthError(message: string): string {
  const trimmed = message.trim();
  const redactedServerError = /\[Request ID:\s*[^\]]+\]\s*Server Error/i.test(trimmed);

  if (redactedServerError || /^Server Error$/i.test(trimmed)) {
    return 'Email or password was not accepted. Confirm this named portal account has been created.';
  }

  if (/Invalid credentials/i.test(trimmed)) {
    return 'Email or password was not accepted. Confirm the email and temporary password.';
  }

  return trimmed || 'Unable to authenticate. Contact an administrator if you need a named portal account.';
}
