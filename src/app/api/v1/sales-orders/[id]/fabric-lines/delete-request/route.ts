import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { getSalesOrderByIdFresh } from "@/lib/data/sales-orders";
import {
  guardLineRemovalPatternSync,
  syncPatternAfterLineRemoval,
} from "@/lib/pattern/sync-guard";
import {
  approveFabricLineDelete,
  clearFabricLineDeleteRequest,
  isFabricLineDeletePending,
  requestFabricLineDelete,
} from "@/lib/sales-orders/fabric-line-delete-requests";

/**
 * Zapier/API parity for PO-locked fabric line delete requests.
 * Body: { action, line_id, reason?, actor?, force_cancel_orphan_jobs? }
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      action?: string;
      line_id?: string;
      reason?: string | null;
      actor?: string;
      force_cancel_orphan_jobs?: boolean;
    };
    const action = String(body.action ?? "").trim();
    const lineId = String(body.line_id ?? "").trim();
    if (!lineId) {
      return NextResponse.json({ error: "line_id is required." }, { status: 400 });
    }
    const actor = body.actor?.trim() || "api";

    if (action === "request_delete") {
      const result = await requestFabricLineDelete(id, lineId, actor, {
        reason: body.reason ?? null,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({
        order: result.order,
        line: result.line,
        request: result.summary,
        source: "api",
      });
    }

    if (action === "cancel_request" || action === "keep") {
      const order = await getSalesOrderByIdFresh(id);
      if (!order) {
        return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
      }
      const line = order.fabric_lines.find((entry) => entry.id === lineId);
      if (!line) {
        return NextResponse.json({ error: "Fabric line not found on this order." }, { status: 404 });
      }
      if (!isFabricLineDeletePending(line)) {
        return NextResponse.json({ order, line, source: "api" });
      }

      const result = await clearFabricLineDeleteRequest(id, lineId, actor, {
        asReject: action === "keep",
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({ order: result.order, line: result.line, source: "api" });
    }

    if (action === "confirm_delete") {
      const forceCancel = body.force_cancel_orphan_jobs === true;
      const orderBefore = await getSalesOrderByIdFresh(id);
      if (!orderBefore) {
        return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
      }

      const guard = guardLineRemovalPatternSync(orderBefore, lineId, forceCancel);
      if (!guard.ok) {
        return NextResponse.json(guard.body, { status: guard.status });
      }

      const result = await approveFabricLineDelete(id, lineId, actor);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }

      await syncPatternAfterLineRemoval(
        result.result.order,
        forceCancel || guard.pendingCount > 0
      );

      return NextResponse.json({
        order: result.result.order,
        removed_line_id: result.result.removed_line.id,
        po_id: result.result.po_id,
        po_number: result.result.po_number,
        po_line_was_emailed: result.result.po_line_was_emailed,
        po_line_action: result.result.po_line_action,
        po_cancelled: result.result.po_cancelled,
        supplier_follow_up_needed: result.result.supplier_follow_up_needed,
        source: "api",
      });
    }

    return NextResponse.json(
      {
        error:
          "Unsupported action. Use request_delete, cancel_request, keep, or confirm_delete.",
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("Failed fabric line delete-request action (API):", error);
    return NextResponse.json({ error: "Failed to process delete request." }, { status: 500 });
  }
}
