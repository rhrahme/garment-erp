import type { AuthError } from "@supabase/supabase-js";

const AUTH_SIGN_IN_TIMEOUT_MS = 15_000;
const AUTH_SIGN_IN_MAX_ATTEMPTS = 3;
const AUTH_SIGN_IN_RETRY_BASE_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const AUTH_SERVICE_UNAVAILABLE_MESSAGE =
  "Authentication service temporarily unavailable — try again in a few minutes";

function isEmptyErrorBody(message: string | undefined): boolean {
  const trimmed = message?.trim();
  return !trimmed || trimmed === "{}" || trimmed === "[]";
}

export function isAuthServiceUnavailable(error: AuthError | null | undefined): boolean {
  if (!error) return false;

  if (error.status === 522 || error.status === 503 || error.name === "AuthRetryableFetchError") {
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

/** Retry sign-in when Auth/GoTrue is degraded (522, timeout, empty body). */
export async function signInWithPasswordWithRetry(
  signIn: () => Promise<{ error: AuthError | null }>
): Promise<{ error: AuthError | null; timedOut: boolean; attempts: number }> {
  let lastError: AuthError | null = null;
  let timedOut = false;

  for (let attempt = 1; attempt <= AUTH_SIGN_IN_MAX_ATTEMPTS; attempt++) {
    const result = await signInWithPasswordWithTimeout(signIn);
    if (!result.timedOut && !isAuthServiceUnavailable(result.error)) {
      return { error: result.error, timedOut: false, attempts: attempt };
    }

    lastError = result.error;
    timedOut = timedOut || result.timedOut;

    if (attempt < AUTH_SIGN_IN_MAX_ATTEMPTS) {
      await sleep(AUTH_SIGN_IN_RETRY_BASE_MS * attempt);
    }
  }

  return { error: lastError, timedOut, attempts: AUTH_SIGN_IN_MAX_ATTEMPTS };
}
