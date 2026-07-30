import { NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readSalesOrders } from "@/lib/data/sales-orders";
import { readSalesWorkspace } from "@/lib/data/sales-workspace";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { assignSalesClientPhotoToFabric } from "@/lib/sales/mutations";

/**
 * Zapier / API: assign (or clear) a client wearing photo to a fabric line / article.
 * Body: { fabric_line_id, optional article_number / sales_order_id / so_number /
 * client_pattern_id / assigned_by }  omit or null fabric_line_id to unassign.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ photoId: string }> }
) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  await ensureDocumentsLoaded(["clients", "sales_workspace", "sales_orders"]);
  const { photoId } = await context.params;
  const details = readSalesWorkspace().client_details.find((entry) =>
    entry.photos.some((item) => item.id === photoId)
  );
  if (!details) return NextResponse.json({ error: "Photo not found." }, { status: 404 });

  let body: {
    fabric_line_id?: string | null;
    article_number?: string | null;
    sales_order_id?: string | null;
    so_number?: string | null;
    client_pattern_id?: string | null;
    assigned_by?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  let fabricLineId =
    body.fabric_line_id === undefined || body.fabric_line_id === null
      ? null
      : String(body.fabric_line_id).trim() || null;
  let articleNumber = body.article_number?.trim() || null;
  let salesOrderId = body.sales_order_id?.trim() || null;
  let soNumber = body.so_number?.trim() || null;
  const clientPatternId = body.client_pattern_id?.trim() || null;

  if (fabricLineId) {
    let matched = false;
    for (const order of readSalesOrders().orders) {
      if (order.client_id !== details.client_id) continue;
      const line = order.fabric_lines.find((entry) => entry.id === fabricLineId);
      if (!line) continue;
      matched = true;
      articleNumber = articleNumber || line.fabric_number || null;
      salesOrderId = salesOrderId || order.id;
      soNumber = soNumber || order.so_number;
      break;
    }
    if (!matched) {
      return NextResponse.json(
        { error: "Fabric line not found for this client." },
        { status: 400 }
      );
    }
  }

  const updated = await assignSalesClientPhotoToFabric(
    photoId,
    {
      fabric_line_id: fabricLineId,
      article_number: articleNumber,
      sales_order_id: salesOrderId,
      so_number: soNumber,
      client_pattern_id: clientPatternId,
    },
    typeof body.assigned_by === "string" ? body.assigned_by : "api",
    "api"
  );
  if (!updated) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  return NextResponse.json({ photo: updated.photo, client_id: updated.client_id, source: "api" });
}
