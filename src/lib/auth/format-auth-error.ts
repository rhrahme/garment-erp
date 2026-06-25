import type { AuthError } from "@supabase/supabase-js";

/** Per-attempt cap — fail fast when GoTrue is down instead of blocking the UI for ~45s. */
const AUTH_SIGN_IN_TIMEOUT_MS = 8_000;
/** Only retry transient timeouts; 522/503 are definitive outages. */
const AUTH_SIGN_IN_MAX_ATTEMPTS = 2;
const AUTH_SIGN_IN_RETRY_BASE_MS = 750;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const AUTH_SERVICE_UNAVAILABLE_MESSAGE =
  "Authentication service temporarily unavailable — try again in a few minutes";

function isEmptyErrorBody(message: string | undefined): boolean {
  const trimmed = message?.trim();
  return !trimmed || trimmed === "{}" || trimmed === "[]";
}

/** Cloudflare / gateway errors — retrying wastes ~20s per attempt. */
export function isDefinitiveAuthOutage(error: AuthError | null | undefined): boolean {
  if (!error) return false;
  return error.status === 522 || error.status === 503;
}

export function isAuthServiceUnavailable(error: AuthError | null | undefined): boolean {
  if (!error) return false;

  if (isDefinitiveAuthOutage(error) || error.name === "AuthRetryableFetchError") {
    return true;
  }

  return isEmptyErrorBody(error.message);
}

export function formatAuthError(error: AuthError | null | undefined): string {
  if (!error) return "Sign in failed.";

  if (isAuthServiceUnavailable(error)) {
    return AUTH_SERVICE_UNAVAILABLE_MESSAGE;
  }

  const message = error.message?.trim();
  if (message) return message;

  return "Invalid email or password.";
}

export async function signInWithPasswordWithTimeout(
  signIn: () => Promise<{ error: AuthError | null }>
): Promise<{ error: AuthError | null; timedOut: boolean }> {
  let timedOut = false;
  const result = await Promise.race([
    signIn(),
    new Promise<{ error: AuthError | null }>((resolve) => {
      setTimeout(() => {
        timedOut = true;
        resolve({ error: null });
      }, AUTH_SIGN_IN_TIMEOUT_MS);
    }),
  ]);
  return { error: result.error, timedOut };
}

function shouldRetrySignIn(result: {
  error: AuthError | null;
  timedOut: boolean;
}): boolean {
  if (isDefinitiveAuthOutage(result.error)) return false;
  if (result.timedOut) return true;
  if (!result.error) return false;
  return result.error.name === "AuthRetryableFetchError" || isEmptyErrorBody(result.error.message);
}

/** Retry sign-in only on transient timeouts — not on 522/503 outages. */
export async function signInWithPasswordWithRetry(
  signIn: () => Promise<{ error: AuthError | null }>
): Promise<{ error: AuthError | null; timedOut: boolean; attempts: number }> {
  let lastError: AuthError | null = null;
  let timedOut = false;

  for (let attempt = 1; attempt <= AUTH_SIGN_IN_MAX_ATTEMPTS; attempt++) {
    const result = await signInWithPasswordWithTimeout(signIn);
    if (!result.timedOut && !isAuthServiceUnavailable(result.error) && !result.error) {
      return { error: null, timedOut: false, attempts: attempt };
    }
    if (!result.timedOut && result.error && !shouldRetrySignIn(result)) {
      return { error: result.error, timedOut: false, attempts: attempt };
    }

    lastError = result.error;
    timedOut = timedOut || result.timedOut;

    if (attempt < AUTH_SIGN_IN_MAX_ATTEMPTS && shouldRetrySignIn(result)) {
      await sleep(AUTH_SIGN_IN_RETRY_BASE_MS * attempt);
    } else {
      break;
    }
  }

  return { error: lastError, timedOut, attempts: AUTH_SIGN_IN_MAX_ATTEMPTS };
}
