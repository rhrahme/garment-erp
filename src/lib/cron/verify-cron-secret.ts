/** Vercel Cron sends Authorization: Bearer CRON_SECRET when CRON_SECRET is set. */
export function verifyCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}
