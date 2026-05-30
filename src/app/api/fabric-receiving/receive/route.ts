import { NextResponse } from "next/server";
import { receiveFabricLine } from "@/lib/production/fabric-receiving";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { sales_order_line_id?: string };
    const sales_order_line_id = String(body.sales_order_line_id ?? "").trim();
    if (!sales_order_line_id) {
      return NextResponse.json({ error: "Select fabric to receive." }, { status: 400 });
    }

    const result = receiveFabricLine(sales_order_line_id);
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to receive fabric.";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
