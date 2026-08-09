import { NextResponse } from "next/server";
import { requirePatternAccess } from "@/lib/auth/session";
import { ensurePatternDocumentsLoaded } from "@/lib/data/pattern-jobs";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { ensurePatternLibraryLoaded } from "@/lib/data/pattern-library";
import { runAutoConsolidate } from "@/lib/pattern/auto-consolidate";

export async function POST(request: Request) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }

    await ensurePatternDocumentsLoaded();
    await ensurePatternLibraryLoaded();
    await ensureDocumentsLoaded(["sales_orders"]);

    const body = (await request.json().catch(() => ({}))) as {
      sales_order_id?: string | null;
      client_id?: string | null;
      dry_run?: boolean;
      unit?: string | null;
    };
    const unit = body.unit === "cm" || body.unit === "in" ? body.unit : null;

    const result = await runAutoConsolidate({
      sales_order_id: typeof body.sales_order_id === "string" ? body.sales_order_id : null,
      client_id: typeof body.client_id === "string" ? body.client_id : null,
      dry_run: Boolean(body.dry_run),
      actedBy: session.email,
      notify: !body.dry_run,
      unit,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to auto-consolidate patterns:", error);
    return NextResponse.json({ error: "Failed to auto-consolidate patterns." }, { status: 500 });
  }
}
