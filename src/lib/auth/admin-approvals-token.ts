import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed token for the /approvals page linked from admin notification
 * emails. Grants ONE named admin (the email recipient) 7 days of access to
 * view and decide the pending admin request queues (client name changes,
 * sewing session change requests, fabric line delete requests) from a phone
 * without logging in. The token is the authorization - the page and its API
 * are session-exempt in the middleware.
 */

export type AdminApprovalsTokenPayload = {
  scope: "admin_approvals";
  /** Admin the email was sent to - recorded as the actor on every decision. */
  admin_email: string;
  /** Unix ms expiry. */
  exp: number;
};

export const ADMIN_APPROVALS_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function signingSecret(): string {
  const secret =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.CRON_SECRET?.trim() || "";
  if (!secret) {
    throw new Error("No signing secret available for admin approvals tokens.");
  }
  return secret;
}

function hmac(data: string): string {
  return createHmac("sha256", signingSecret()).update(data).digest("base64url");
}

export function signAdminApprovalsToken(adminEmail: string, exp?: number): string {
  const payload: AdminApprovalsTokenPayload = {
    scope: "admin_approvals",
    admin_email: adminEmail,
    exp: exp ?? Date.now() + ADMIN_APPROVALS_TOKEN_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${hmac(body)}`;
}

export type VerifyAdminApprovalsTokenResult =
  | { ok: true; payload: AdminApprovalsTokenPayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export function verifyAdminApprovalsToken(token: string): VerifyAdminApprovalsTokenResult {
  const dot = token.lastIndexOf(".");
  if (dot <= 0 || dot === token.length - 1) return { ok: false, reason: "malformed" };
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const expected = hmac(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: AdminApprovalsTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (
    payload.scope !== "admin_approvals" ||
    typeof payload.admin_email !== "string" ||
    payload.admin_email.length === 0 ||
    typeof payload.exp !== "number"
  ) {
    return { ok: false, reason: "malformed" };
  }
  if (Date.now() > payload.exp) return { ok: false, reason: "expired" };
  return { ok: true, payload };
}
