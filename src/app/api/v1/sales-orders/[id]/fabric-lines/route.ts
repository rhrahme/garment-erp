import { NextResponse } from "next/server";
import { notifyIntegration } from "@/lib/integrations";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import {
  appendSalesOrderFabricLines,
  updateSalesOrderFabricLine,
  type FabricLineInput,
  type FabricLineUpdateInput,
} from "@/lib/sales-orders/fabric-lines";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      fabric_lines?: FabricLineInput[];
      added_by?: string;
    };
    const inputs = body.fabric_lines ?? [];
    const addedBy = body.added_by?.trim() || "api";

    const result = await appendSalesOrderFabricLines(id, inputs, { addedBy });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await notifyIntegration("sales_order.fabric_lines_added", {
      order_id: result.order.id,
      so_number: result.order.so_number,
      added_line_ids: result.added_lines.map((line) => line.id),
      added_count: result.added_lines.length,
      added_by: addedBy,
      source: "api",
    });

    return NextResponse.json({
      order: result.order,
      added_lines: result.added_lines.length,
    });
  } catch (error) {
    console.error("Failed to append fabric lines (API):", error);
    return NextResponse.json({ error: "Failed to add fabric lines." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    const { id } = await context.params;
    const body = (await request.json()) as FabricLineUpdateInput & {
      updated_by?: string;
      allow_price_edit?: boolean;
    };
    const updatedBy = body.updated_by?.trim() || "api";

    const result = await updateSalesOrderFabricLine(id, body, {
      updatedBy,
      allowPriceEdit: Boolean(body.allow_price_edit),
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await notifyIntegration("sales_order.fabric_lines_updated", {
      order_id: result.order.id,
      so_number: result.order.so_number,
      line_id: result.updated_line.id,
      updated_by: updatedBy,
      source: "api",
    });

    return NextResponse.json({
      order: result.order,
      updated_line: result.updated_line,
    });
  } catch (error) {
    console.error("Failed to update fabric line (API):", error);
    return NextResponse.json({ error: "Failed to update fabric line." }, { status: 500 });
  }
}
