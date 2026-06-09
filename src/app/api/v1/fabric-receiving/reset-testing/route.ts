import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { ensureFabricReceivingDocumentsLoaded } from "@/lib/data/fabric-receiving-docs";
import { resetFabricReceivingForTesting } from "@/lib/production/fabric-receiving-reset";

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensureFabricReceivingDocumentsLoaded();
    const body = (await request.json()) as {
      sales_order_id?: string;
      sales_order_line_ids?: string[];
      clear_print_timestamps?: boolean;
    };

    const result = await resetFabricReceivingForTesting(
      {
        sales_order_id: String(body.sales_order_id ?? "").trim(),
        sales_order_line_ids: body.sales_order_line_ids,
        clear_print_timestamps: body.clear_print_timestamps,
      },
      "api"
    );

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reset fabric receiving.";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
