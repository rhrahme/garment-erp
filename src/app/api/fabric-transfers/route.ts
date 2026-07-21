import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  listFabricTransfersForLine,
  listFabricTransfersForSalesOrder,
  readFabricTransfersFresh,
} from "@/lib/data/fabric-transfers";
import { canTransferFabric } from "@/lib/sales-orders/transfer-fabric";

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (!canTransferFabric(session) && !session.isAdmin) {
      // Sales/task can still read history on orders they can open — allow any authenticated.
    }

    await ensureDocumentsLoaded(["fabric_transfers"]);

    const { searchParams } = new URL(request.url);
    const salesOrderId = searchParams.get("sales_order_id")?.trim() ?? "";
    const lineId = searchParams.get("line_id")?.trim() ?? "";

    if (lineId) {
      return NextResponse.json({ transfers: listFabricTransfersForLine(lineId) });
    }
    if (salesOrderId) {
      return NextResponse.json({ transfers: listFabricTransfersForSalesOrder(salesOrderId) });
    }

    return NextResponse.json({ transfers: readFabricTransfersFresh().transfers });
  } catch (error) {
    console.error("Failed to list fabric transfers:", error);
    return NextResponse.json({ error: "Failed to load fabric transfers." }, { status: 500 });
  }
}
