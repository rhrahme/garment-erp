import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { acknowledgeGarmentTypeChange } from "@/lib/sales-orders/acknowledge-garment-type-change";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    const { id } = await context.params;
    const body = (await request.json()) as { action?: string; acknowledged_by?: string };
    if (body.action !== "acknowledge") {
      return NextResponse.json(
        { error: 'action must be "acknowledge".' },
        { status: 400 }
      );
    }

    const acknowledgedBy = body.acknowledged_by?.trim() || "api";
    const result = await acknowledgeGarmentTypeChange(id, acknowledgedBy);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ change: result.change, source: "api" });
  } catch (error) {
    console.error("Failed to acknowledge garment type change (API):", error);
    return NextResponse.json({ error: "Failed to acknowledge change." }, { status: 500 });
  }
}
