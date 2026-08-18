import { createHmac, timingSafeEqual } from "node:crypto";
import { ADMIN_APPROVALS_TOKEN_TTL_MS } from "@/lib/auth/admin-approvals-token";

/**
 * Signed one-click tokens for Approve/Reject links in stitch and fabric-delete
 * admin emails. Same rules as name-change-email-token: bound to one request
 * + recipient admin, 7-day expiry, no login.
 */

export type AdminDecisionEmailAction = "approve" | "reject";

export type SewingDecisionEmailPayload = {
  kind: "sewing_session";
  request_id: string;
  requested_at: string;
  action: AdminDecisionEmailAction;
  admin_email: string;
  exp: number;
};

export type FabricDeleteDecisionEmailPayload = {
  kind: "fabric_line_delete";
  order_id: string;
  line_id: string;
  requested_at: string;
  action: AdminDecisionEmailAction;
  admin_email: string;
  exp: number;
};

export type AdminDecisionEmailPayload =
  | SewingDecisionEmailPayload
  | FabricDeleteDecisionEmailPayload;

export const ADMIN_DECISION_EMAIL_TOKEN_TTL_MS = ADMIN_APPROVALS_TOKEN_TTL_MS;

function signingSecret(): string {
  const secret =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.CRON_SECRET?.trim() || "";
  if (!secret) {
    throw new Error("No signing secret available for admin decision email tokens.");
  }
  return secret;
}

function hmac(data: string): string {
  return createHmac("sha256", signingSecret()).update(data).digest("base64url");
}

export function signAdminDecisionEmailToken(payload: AdminDecisionEmailPayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${hmac(body)}`;
}

export type VerifyAdminDecisionEmailTokenResult =
  | { ok: true; payload: AdminDecisionEmailPayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export function verifyAdminDecisionEmailToken(token: string): VerifyAdminDecisionEmailTokenResult {
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

  let payload: AdminDecisionEmailPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!isPayload(payload)) return { ok: false, reason: "malformed" };
  if (Date.now() > payload.exp) return { ok: false, reason: "expired" };
  return { ok: true, payload };
}

function isPayload(value: AdminDecisionEmailPayload): value is AdminDecisionEmailPayload {
  if (
    typeof value.requested_at !== "string" ||
    typeof value.admin_email !== "string" ||
    typeof value.exp !== "number" ||
    (value.action !== "approve" && value.action !== "reject")
  ) {
    return false;
  }
  if (value.kind === "sewing_session") {
    return typeof value.request_id === "string" && value.request_id.length > 0;
  }
  if (value.kind === "fabric_line_delete") {
    return (
      typeof value.order_id === "string" &&
      value.order_id.length > 0 &&
      typeof value.line_id === "string" &&
      value.line_id.length > 0
    );
  }
  return false;
}
