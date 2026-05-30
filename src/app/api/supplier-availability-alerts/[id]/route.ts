import { NextResponse } from "next/server";
import { resolveSupplierAvailabilityAlert } from "@/lib/integrations/supplier-availability-store";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      resolution?: "wait" | "replace" | "dismissed";
      resolution_note?: string | null;
    };

    if (!body.resolution || !["wait", "replace", "dismissed"].includes(body.resolution)) {
      return NextResponse.json({ error: "resolution must be wait, replace, or dismissed." }, { status: 400 });
    }

    const alert = resolveSupplierAvailabilityAlert(id, body.resolution, body.resolution_note);
    if (!alert) {
      return NextResponse.json({ error: "Alert not found." }, { status: 404 });
    }

    return NextResponse.json({ alert });
  } catch (error) {
    console.error("Failed to resolve availability alert:", error);
    return NextResponse.json({ error: "Failed to update alert." }, { status: 500 });
  }
}
