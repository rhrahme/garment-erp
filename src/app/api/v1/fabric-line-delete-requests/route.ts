import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { ensureFabricOrdersLoaded } from "@/lib/integrations/fabric-order-store";
import { listPendingFabricLineDeleteRequests } from "@/lib/sales-orders/fabric-line-delete-requests";

export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  await ensureDocumentsLoaded(["sales_orders", "fabric_orders"]);
  await ensureFabricOrdersLoaded();
  const requests = listPendingFabricLineDeleteRequests();
  return NextResponse.json({ requests, count: requests.length, source: "api" });
}
