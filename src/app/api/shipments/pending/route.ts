import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/json-file-cache";
import { ensureFabricOrdersLoaded } from "@/lib/integrations/fabric-order-store";
import { listPendingAwbFabricOrders } from "@/lib/integrations/pending-awb";
import { ensureShipmentsLoaded } from "@/lib/integrations/shipment-store";

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    await Promise.all([
      ensureShipmentsLoaded(),
      ensureFabricOrdersLoaded(),
      ensureDocumentsLoaded(["supplier_contacts", "sales_orders"]),
    ]);
    const pending = listPendingAwbFabricOrders();
    return NextResponse.json({ pending, count: pending.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load pending AWBs.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
