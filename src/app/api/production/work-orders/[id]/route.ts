import { NextResponse } from "next/server";
import { advanceProductionWorkOrder, startFabricPrep } from "@/lib/production/sticker-scan";
import { isFabricPrepType } from "@/lib/production/fabric-prep";

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
      const work_order = startFabricPrep(id, fabric_prep_type);
      return NextResponse.json({ work_order });
    }

    const work_order = advanceProductionWorkOrder(id);
    return NextResponse.json({ work_order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update work order.";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
