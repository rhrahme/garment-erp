import { NextResponse } from "next/server";
import { listSupplierEmailQueue } from "@/lib/fabric-sourcing/supplier-email-queue";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const salesOrderId = url.searchParams.get("sales_order_id");
    const orders = await listSupplierEmailQueue(salesOrderId);
    return NextResponse.json({ orders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load supplier emails.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
