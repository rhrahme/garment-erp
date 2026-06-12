import type { AuthError } from "@supabase/supabase-js";

const AUTH_SIGN_IN_TIMEOUT_MS = 12_000;

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
