import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { ensureFabricReceivingDocumentsLoaded } from "@/lib/data/fabric-receiving-docs";
import { resetFabricReceivingForTesting } from "@/lib/production/fabric-receiving-reset";

function canResetFabricReceiving(session: NonNullable<Awaited<ReturnType<typeof requireAuthenticated>>>): boolean {
  return session.isAdmin || session.isClientManager;
}

export async function POST(request: Request) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!canResetFabricReceiving(session)) {
    return NextResponse.json({ error: "Admin or QC access required." }, { status: 403 });
  }

  try {
    await ensureFabricReceivingDocumentsLoaded();
    const body = (await request.json()) as {
      sales_order_id?: string;
      sales_order_line_ids?: string[];
      clear_print_timestamps?: boolean;
    };

    const result = await resetFabricReceivingForTesting({
      sales_order_id: String(body.sales_order_id ?? "").trim(),
      sales_order_line_ids: body.sales_order_line_ids,
      clear_print_timestamps: body.clear_print_timestamps,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reset fabric receiving.";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
