import { NextResponse } from "next/server";
import {
  listSupplierEmailBatches,
  listSupplierEmailQueue,
} from "@/lib/fabric-sourcing/supplier-email-queue";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const salesOrderId = url.searchParams.get("sales_order_id");
    const [orders, batches] = await Promise.all([
      listSupplierEmailQueue(salesOrderId),
      listSupplierEmailBatches(salesOrderId),
    ]);
    return NextResponse.json({ orders, batches });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load supplier emails.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
