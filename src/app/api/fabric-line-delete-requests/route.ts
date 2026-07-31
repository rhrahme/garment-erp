import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { ensureFabricOrdersLoaded } from "@/lib/integrations/fabric-order-store";
import { listPendingFabricLineDeleteRequests } from "@/lib/sales-orders/fabric-line-delete-requests";

/** Admin dashboard: list pending PO-locked fabric line delete requests. */
export async function GET() {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!session.isAdmin) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  await ensureDocumentsLoaded(["sales_orders", "fabric_orders"]);
  await ensureFabricOrdersLoaded();
  const requests = listPendingFabricLineDeleteRequests();
  return NextResponse.json({ requests, count: requests.length });
}
