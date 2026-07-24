import { NextResponse } from "next/server";
import { getProductionWorkOrderById } from "@/lib/data/production-work-orders";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { notifyIntegration, verifyApiKey } from "@/lib/integrations";
import { advanceProductionWorkOrder } from "@/lib/production/sticker-scan";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensureDocumentsLoaded(["production_work_orders"]);
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { action?: string };

    if (body.action && body.action !== "advance") {
      return NextResponse.json({ error: 'Only action "advance" is supported.' }, { status: 400 });
    }

    const before = getProductionWorkOrderById(id);
    if (!before) {
      return NextResponse.json({ error: "Production work order not found." }, { status: 404 });
    }

    const previous_status = before.status;
    const work_order = await advanceProductionWorkOrder(id);
    const handedToDriver = work_order.status === "completed" && previous_status === "packed";

    await notifyIntegration(
      handedToDriver ? "production.handed_to_driver" : "production.stage_advanced",
      {
        work_order_id: work_order.id,
        sticker_code: work_order.sticker_code,
        so_number: work_order.so_number,
        client_code: work_order.client_code,
        client_name: work_order.client_name,
        previous_status,
        new_status: work_order.status,
        handed_to_driver: handedToDriver,
      },
      "api"
    );

    return NextResponse.json({ ok: true, work_order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to advance work order.";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
