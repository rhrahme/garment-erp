/**
 * Warm all ERP documents from Supabase once per Node.js serverless instance (cold start).
 * Root layout also awaits the same promise so SSR cannot race ahead of the first load.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { ensureErpBootstrap } = await import(
    /* webpackIgnore: true */
    "@/lib/data/document-persistence"
  );
  await ensureErpBootstrap();
}
