import { NextResponse } from "next/server";
import { redactSalesOrderFabricPrices } from "@/lib/auth/fabric-price-access";
import { requireAuthenticated } from "@/lib/auth/session";
import { notifyIntegration } from "@/lib/integrations";
import {
  appendSalesOrderFabricLines,
  type FabricLineInput,
} from "@/lib/sales-orders/fabric-lines";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id } = await context.params;
    const body = (await request.json()) as { fabric_lines?: FabricLineInput[] };
    const inputs = body.fabric_lines ?? [];

    const result = await appendSalesOrderFabricLines(id, inputs, { addedBy: session.email });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await notifyIntegration("sales_order.fabric_lines_added", {
      order_id: result.order.id,
      so_number: result.order.so_number,
      added_line_ids: result.added_lines.map((line) => line.id),
      added_count: result.added_lines.length,
      added_by: session.email,
    });

    const safeOrder = session.canViewFabricListPrices
      ? result.order
      : redactSalesOrderFabricPrices(result.order);

    return NextResponse.json({ order: safeOrder, added_lines: result.added_lines.length }, { status: 200 });
  } catch (error) {
    console.error("Failed to append fabric lines:", error);
    return NextResponse.json({ error: "Failed to add fabric lines." }, { status: 500 });
  }
}
