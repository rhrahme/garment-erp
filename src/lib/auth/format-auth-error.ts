import type { AuthError } from "@supabase/supabase-js";

const AUTH_SIGN_IN_TIMEOUT_MS = 12_000;

export function formatAuthError(error: AuthError | null | undefined): string {
  if (!error) return "Sign in failed.";

  if (error.status === 522 || error.name === "AuthRetryableFetchError") {
    return "Authentication service is temporarily unavailable. Please try again in a few minutes.";
  }

  const message = error.message?.trim();
  if (message && message !== "{}") return message;

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
