import { NextResponse } from "next/server";
import { verifyAdminApprovalsToken } from "@/lib/auth/admin-approvals-token";
import {
  approveClientNameChange,
  rejectClientNameChange,
} from "@/lib/clients/name-change-requests";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { decideSewingSessionChangeRequest } from "@/lib/production/sewing-session-change-requests";
import {
  approveFabricLineDelete,
  clearFabricLineDeleteRequest,
} from "@/lib/sales-orders/fabric-line-delete-requests";

export const dynamic = "force-dynamic";

/**
 * Batch approve/reject for the /approvals page (linked from admin emails).
 * No session - the signed token IS the authorization (see
 * admin-approvals-token.ts). Each decision is applied through the same
 * functions the dashboard panels use, so all integration events still fire.
 */

export type AdminApprovalDecision =
  | { kind: "name_change"; client_id: string; action: "approve" | "reject" }
  | { kind: "sewing_session"; request_id: string; action: "approve" | "reject" }
  | {
      kind: "fabric_line_delete";
      order_id: string;
      line_id: string;
      action: "approve" | "reject";
    };

type DecisionResult = { key: string; ok: boolean; error?: string };

function decisionKey(decision: AdminApprovalDecision): string {
  if (decision.kind === "name_change") return `name_change:${decision.client_id}`;
  if (decision.kind === "sewing_session") return `sewing_session:${decision.request_id}`;
  return `fabric_line_delete:${decision.order_id}:${decision.line_id}`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      token?: string;
      decisions?: AdminApprovalDecision[];
    } | null;

    const verified = verifyAdminApprovalsToken(body?.token ?? "");
    if (!verified.ok) {
      const message =
        verified.reason === "expired"
          ? "This approvals link expired (7 days). Ask for a new email or use the dashboard."
          : "Invalid approvals link.";
      return NextResponse.json({ error: message }, { status: 401 });
    }

    const decisions = Array.isArray(body?.decisions) ? body.decisions : [];
    if (decisions.length === 0) {
      return NextResponse.json({ error: "decisions are required." }, { status: 400 });
    }
    if (decisions.length > 100) {
      return NextResponse.json({ error: "Too many decisions in one call." }, { status: 400 });
    }

    const actor = `${verified.payload.admin_email} (email link)`;
    await ensureDocumentsLoaded([
      "clients",
      "sales_orders",
      "sewing_session_change_requests",
    ]);

    const results: DecisionResult[] = [];
    for (const decision of decisions) {
      const key = decisionKey(decision);
      try {
        if (decision.kind === "name_change") {
          const result =
            decision.action === "approve"
              ? await approveClientNameChange(decision.client_id, actor)
              : await rejectClientNameChange(decision.client_id, actor);
          results.push(result.ok ? { key, ok: true } : { key, ok: false, error: result.error });
        } else if (decision.kind === "sewing_session") {
          const result = await decideSewingSessionChangeRequest(
            decision.request_id,
            decision.action,
            actor,
            { source: "api" }
          );
          results.push(result.ok ? { key, ok: true } : { key, ok: false, error: result.error });
        } else if (decision.kind === "fabric_line_delete") {
          const result =
            decision.action === "approve"
              ? await approveFabricLineDelete(decision.order_id, decision.line_id, actor)
              : await clearFabricLineDeleteRequest(decision.order_id, decision.line_id, actor, {
                  asReject: true,
                });
          results.push(result.ok ? { key, ok: true } : { key, ok: false, error: result.error });
        } else {
          results.push({ key: "unknown", ok: false, error: "Unknown request kind." });
        }
      } catch (error) {
        results.push({
          key,
          ok: false,
          error: error instanceof Error ? error.message : "Failed to apply the decision.",
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Admin approvals batch failed:", error);
    return NextResponse.json({ error: "Failed to apply approvals." }, { status: 500 });
  }
}
