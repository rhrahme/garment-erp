import { NextResponse } from "next/server";
import { verifyAdminDecisionEmailToken } from "@/lib/auth/admin-decision-email-token";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  listPendingSewingSessionChangeRequests,
  readSewingSessionChangeRequestsFresh,
} from "@/lib/data/sewing-session-change-requests";
import { ensureFabricOrdersLoaded } from "@/lib/integrations/fabric-order-store";
import { decideSewingSessionChangeRequest } from "@/lib/production/sewing-session-change-requests";
import {
  approveFabricLineDelete,
  clearFabricLineDeleteRequest,
  listPendingFabricLineDeleteRequests,
} from "@/lib/sales-orders/fabric-line-delete-requests";

export const dynamic = "force-dynamic";

function page(title: string, detail: string, tone: "ok" | "warn" | "error"): NextResponse {
  const color = tone === "ok" ? "#047857" : tone === "warn" ? "#b45309" : "#b91c1c";
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Garment ERP</title>
<style>
  body { font-family: Helvetica, Arial, sans-serif;
         background: #f8fafc; margin: 0; padding: 40px 16px; }
  .card { max-width: 460px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0;
          border-radius: 12px; padding: 28px 24px; }
  h1 { font-size: 18px; margin: 0 0 8px; color: ${color}; }
  p { font-size: 14px; color: #334155; margin: 0 0 6px; line-height: 1.5; }
  .muted { color: #94a3b8; font-size: 12px; margin-top: 16px; }
</style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${detail}</p>
    <p class="muted">Garment ERP - admin approvals</p>
  </div>
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const verified = verifyAdminDecisionEmailToken(token);
  if (!verified.ok) {
    if (verified.reason === "expired") {
      return page(
        "Link expired",
        "This approval link is older than 7 days. Open the ERP dashboard to handle the request.",
        "warn"
      );
    }
    return page("Invalid link", "This approval link is not valid.", "error");
  }

  const payload = verified.payload;
  const actor = `${payload.admin_email} (email link)`;

  if (payload.kind === "sewing_session") {
    await ensureDocumentsLoaded(["sewing_session_change_requests"]);
    const store = await readSewingSessionChangeRequestsFresh();
    const pending = listPendingSewingSessionChangeRequests(store).find(
      (row) => row.id === payload.request_id
    );
    if (!pending) {
      return page(
        "Already handled",
        "This stitch request was already approved, rejected, or cancelled. Nothing was changed.",
        "warn"
      );
    }
    if (pending.requested_at !== payload.requested_at) {
      return page(
        "Request was updated",
        "A newer stitch request replaced this one. Use the latest email or the dashboard.",
        "warn"
      );
    }
    const result = await decideSewingSessionChangeRequest(
      payload.request_id,
      payload.action,
      actor,
      { source: "api" }
    );
    if (!result.ok) {
      return page(
        payload.action === "approve" ? "Could not approve" : "Could not reject",
        result.error,
        "error"
      );
    }
    return page(
      payload.action === "approve" ? "Request approved" : "Request rejected",
      payload.action === "approve"
        ? "The stitch change is applied."
        : "The stitch data was left as it was.",
      "ok"
    );
  }

  await ensureDocumentsLoaded(["sales_orders"]);
  await ensureFabricOrdersLoaded();
  const pending = listPendingFabricLineDeleteRequests().find(
    (row) => row.sales_order_id === payload.order_id && row.line_id === payload.line_id
  );
  if (!pending) {
    return page(
      "Already handled",
      "This fabric delete request was already approved or rejected. Nothing was changed.",
      "warn"
    );
  }
  if (pending.delete_requested_at !== payload.requested_at) {
    return page(
      "Request was updated",
      "A newer fabric delete request replaced this one. Use the latest email or the dashboard.",
      "warn"
    );
  }

  if (payload.action === "approve") {
    const result = await approveFabricLineDelete(payload.order_id, payload.line_id, actor);
    if (!result.ok) return page("Could not approve", result.error, "error");
    return page(
      "Fabric delete approved",
      `${pending.so_number} ${pending.article_label} (${pending.fabric_number}) was removed.`,
      "ok"
    );
  }

  const result = await clearFabricLineDeleteRequest(payload.order_id, payload.line_id, actor, {
    asReject: true,
  });
  if (!result.ok) return page("Could not reject", result.error, "error");
  return page(
    "Fabric delete rejected",
    `${pending.so_number} ${pending.article_label} (${pending.fabric_number}) stays on the order.`,
    "ok"
  );
}
