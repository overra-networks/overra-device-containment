export interface ResetTokenState {
  token: string;
  shouldStripUrl: boolean;
}

/**
 * Computes the next reset-token state for the reset-password page effect.
 *
 * Guards against the Next.js 14.1+ behavior where useSearchParams reacts to
 * window.history.replaceState — after stripping ?token=... from the URL the
 * effect re-runs with empty params and would otherwise overwrite the captured
 * token, breaking submit with "Missing reset token".
 */
export function nextResetTokenState(
  currentToken: string,
  paramToken: string | null
): ResetTokenState {
  const incoming = paramToken ?? "";
  if (incoming) {
    return { token: incoming, shouldStripUrl: true };
  }
  return { token: currentToken, shouldStripUrl: false };
}
