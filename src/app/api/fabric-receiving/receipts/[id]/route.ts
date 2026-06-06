import { NextResponse } from "next/server";
import { ensureFabricReceivingDocumentsLoaded } from "@/lib/data/fabric-receiving-docs";
import { advanceFabricReceipt, startFabricReceiptPrep } from "@/lib/production/fabric-receiving";
import { isFabricPrepType } from "@/lib/production/fabric-prep";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureFabricReceivingDocumentsLoaded();
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
      const receipt = await startFabricReceiptPrep(id, fabric_prep_type);
      return NextResponse.json({ receipt });
    }

    const result = await advanceFabricReceipt(id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update fabric receipt.";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
