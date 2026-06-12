/**
 * Next.js instrumentation hook (Node cold start).
 *
 * ERP document bootstrap runs in src/app/(dashboard)/layout.tsx (webpack-bundled). API handlers
 * call ensureErpBootstrap() as needed. Do not dynamic-import document-persistence
 * here — webpack leaves import("@/…") unresolved at runtime and 500s every function.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
}
