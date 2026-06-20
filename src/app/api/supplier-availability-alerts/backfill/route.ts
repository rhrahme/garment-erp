import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { backfillSupplierAvailabilityFromReplies } from "@/lib/integrations/apply-supplier-availability";

export async function POST() {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const result = await backfillSupplierAvailabilityFromReplies();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Failed to backfill supplier availability:", error);
    return NextResponse.json({ error: "Failed to backfill supplier availability." }, { status: 500 });
  }
}
