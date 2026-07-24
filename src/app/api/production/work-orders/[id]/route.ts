import { NextResponse } from "next/server";
import { notifyIntegration } from "@/lib/integrations";
import { advanceProductionWorkOrder, startFabricPrep } from "@/lib/production/sticker-scan";
import { isFabricPrepType } from "@/lib/production/fabric-prep";
import type { ProductionWorkOrder } from "@/lib/types/production";

async function notifyStageAdvance(
  work_order: ProductionWorkOrder,
  previous_status: string,
  source: "erp" | "zapier" | "api" = "erp"
) {
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
    source
  );
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      fabric_prep_type?: string;
    };

    if (body.action === "start_fabric_prep") {
      const fabric_prep_type = String(body.fabric_prep_type ?? "").trim();
      if (!isFabricPrepType(fabric_prep_type)) {
        return NextResponse.json({ error: "Select a valid fabric preparation type." }, { status: 400 });
      }
      const work_order = await startFabricPrep(id, fabric_prep_type);
      return NextResponse.json({ work_order });
    }

    const { getProductionWorkOrderById } = await import("@/lib/data/production-work-orders");
    const before = getProductionWorkOrderById(id);
    const previous_status = before?.status ?? "unknown";
    const work_order = await advanceProductionWorkOrder(id);
    await notifyStageAdvance(work_order, previous_status, "erp");
    return NextResponse.json({ work_order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update work order.";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
