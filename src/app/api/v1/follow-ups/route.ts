import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { getFollowUpOrders } from "@/lib/integrations/follow-ups";
import { notifyIntegration } from "@/lib/integrations";

export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const days = Number(url.searchParams.get("days") ?? 3);
  const orders = getFollowUpOrders(days);

  return NextResponse.json({ count: orders.length, orders });
}

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const days = Number(url.searchParams.get("days") ?? 3);
  const orders = getFollowUpOrders(days);

  for (const order of orders) {
    await notifyIntegration("follow_up.due", {
      id: order.id,
      po_number: order.po_number,
      supplier_id: order.supplier_id,
      supplier_name: order.supplier?.name ?? null,
      emailed_at: order.emailed_at,
      days_since_sent: days,
    });
  }

  return NextResponse.json({
    ok: true,
    triggered: orders.length,
    orders: orders.map((order) => order.po_number),
  });
}
