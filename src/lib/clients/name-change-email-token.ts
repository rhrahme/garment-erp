import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed one-click tokens for the approve/reject links in the admin
 * name-change email. Lets an admin act from their phone inbox without
 * logging in to the ERP.
 *
 * - Bound to one client + one request timestamp: if the requester edits the
 *   proposal (new requested_at) or the request is already handled, old links
 *   stop working.
 * - Bound to the recipient admin email so approvals are attributed.
 * - Expire after 7 days.
 */

export type NameChangeEmailAction = "approve" | "reject";

export type NameChangeEmailTokenPayload = {
  client_id: string;
  action: NameChangeEmailAction;
  /** Must match the client's pending name_change_requested_at. */
  requested_at: string;
  /** Admin the email was sent to - recorded as the actor. */
  admin_email: string;
  /** Unix ms expiry. */
  exp: number;
};

export const NAME_CHANGE_EMAIL_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function signingSecret(): string {
  const secret =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.CRON_SECRET?.trim() || "";
  if (!secret) {
    throw new Error("No signing secret available for name-change email tokens.");
  }
  return secret;
}

function hmac(data: string): string {
  return createHmac("sha256", signingSecret()).update(data).digest("base64url");
}

export function signNameChangeEmailToken(payload: NameChangeEmailTokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${hmac(body)}`;
}

export type VerifyNameChangeEmailTokenResult =
  | { ok: true; payload: NameChangeEmailTokenPayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export function verifyNameChangeEmailToken(token: string): VerifyNameChangeEmailTokenResult {
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

  let payload: NameChangeEmailTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (
    typeof payload.client_id !== "string" ||
    typeof payload.requested_at !== "string" ||
    typeof payload.admin_email !== "string" ||
    typeof payload.exp !== "number" ||
    (payload.action !== "approve" && payload.action !== "reject")
  ) {
    return { ok: false, reason: "malformed" };
  }
  if (Date.now() > payload.exp) return { ok: false, reason: "expired" };
  return { ok: true, payload };
}
