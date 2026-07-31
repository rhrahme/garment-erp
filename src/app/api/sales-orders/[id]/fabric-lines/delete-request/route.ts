import { NextResponse } from "next/server";
import { redactSalesOrderFabricPrices } from "@/lib/auth/fabric-price-access";
import { resolveFabricPriceAccess } from "@/lib/auth/fabric-price-access.server";
import { requireAuthenticated, canModifySalesOrders } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
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
import { canAccessSalesOrder } from "@/lib/sales/access";
import type { SalesOrder } from "@/lib/types/sales-orders";

async function canAccessOrder(
  session: Awaited<ReturnType<typeof requireAuthenticated>>,
  id: string
) {
  if (!session) return false;
  await ensureDocumentsLoaded(["clients", "sales_orders"]);
  const order = await getSalesOrderByIdFresh(id);
  return Boolean(order && canAccessSalesOrder(session, order));
}

/**
 * Actions for PO-locked fabric line delete requests:
 * - request_delete: QC/sales marks line for admin delete
 * - cancel_request: requester clears their own request
 * - keep: admin rejects
 * - confirm_delete: admin approves (removes SO line + cancels PO linkage)
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id } = await context.params;
    if (!(await canAccessOrder(session, id))) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = (await request.json()) as {
      action?: string;
      line_id?: string;
      reason?: string | null;
      force_cancel_orphan_jobs?: boolean;
    };
    const action = String(body.action ?? "").trim();
    const lineId = String(body.line_id ?? "").trim();
    if (!lineId) {
      return NextResponse.json({ error: "line_id is required." }, { status: 400 });
    }

    const actor = session.email ?? "unknown";
    const canViewFabricPrices = await resolveFabricPriceAccess(session);
    const safeOrder = (order: SalesOrder) =>
      canViewFabricPrices ? order : redactSalesOrderFabricPrices(order);

    if (action === "request_delete") {
      if (!canModifySalesOrders(session)) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
      if (session.isAdmin) {
        return NextResponse.json(
          {
            error:
              "Admins can approve pending requests or remove unlocked lines directly. Use OK on a pending request.",
          },
          { status: 400 }
        );
      }

      const result = await requestFabricLineDelete(id, lineId, actor, {
        reason: body.reason ?? null,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({
        order: safeOrder(result.order),
        line: result.line,
        request: result.summary,
      });
    }

    if (action === "cancel_request" || action === "keep") {
      await ensureDocumentsLoaded(["sales_orders"]);
      const order = await getSalesOrderByIdFresh(id);
      if (!order) {
        return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
      }
      const line = order.fabric_lines.find((entry) => entry.id === lineId);
      if (!line) {
        return NextResponse.json({ error: "Fabric line not found on this order." }, { status: 404 });
      }
      if (!isFabricLineDeletePending(line)) {
        return NextResponse.json({ order: safeOrder(order), line });
      }

      if (action === "keep" && !session.isAdmin) {
        return NextResponse.json({ error: "Only admins can reject delete requests." }, { status: 403 });
      }
      if (
        action === "cancel_request" &&
        !session.isAdmin &&
        line.delete_requested_by?.trim().toLowerCase() !== actor.trim().toLowerCase()
      ) {
        return NextResponse.json(
          { error: "You can only cancel your own delete request." },
          { status: 403 }
        );
      }

      const result = await clearFabricLineDeleteRequest(id, lineId, actor, {
        asReject: action === "keep",
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json({ order: safeOrder(result.order), line: result.line });
    }

    if (action === "confirm_delete") {
      if (!session.isAdmin) {
        return NextResponse.json({ error: "Only admins can approve delete requests." }, { status: 403 });
      }

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
        order: safeOrder(result.result.order),
        removed_line_id: result.result.removed_line.id,
        po_id: result.result.po_id,
        po_number: result.result.po_number,
        po_line_was_emailed: result.result.po_line_was_emailed,
        po_line_action: result.result.po_line_action,
        po_cancelled: result.result.po_cancelled,
        supplier_follow_up_needed: result.result.supplier_follow_up_needed,
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
    console.error("Failed fabric line delete-request action:", error);
    return NextResponse.json({ error: "Failed to process delete request." }, { status: 500 });
  }
}
