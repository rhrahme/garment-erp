import { NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { getSalesOrderByIdFresh } from "@/lib/data/sales-orders";
import { readSalesWorkspace } from "@/lib/data/sales-workspace";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { createSalesFitting, updateSalesFitting } from "@/lib/sales/mutations";
import type { SalesFittingStatus } from "@/lib/types/sales-workspace";

const STATUSES: SalesFittingStatus[] = ["scheduled", "done", "no_show", "cancelled"];

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;
  const body = (await request.json()) as {
    sales_order_id?: string;
    scheduled_at?: string;
    notes?: string | null;
  };
  const order = await getSalesOrderByIdFresh(String(body.sales_order_id ?? "").trim());
  if (!order) return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
  const scheduledAt = String(body.scheduled_at ?? "").trim();
  if (!scheduledAt || Number.isNaN(Date.parse(scheduledAt))) {
    return NextResponse.json({ error: "A valid fitting date is required." }, { status: 400 });
  }
  await ensureDocumentsLoaded(["sales_workspace"]);
  const fitting = await createSalesFitting(
    order.id,
    order.client_id,
    scheduledAt,
    String(body.notes ?? "").trim() || null,
    "api",
    "api"
  );
  return NextResponse.json({ fitting }, { status: 201 });
}

export async function PATCH(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;
  await ensureDocumentsLoaded(["sales_workspace"]);
  const body = (await request.json()) as {
    fitting_id?: string;
    scheduled_at?: string;
    notes?: string | null;
    status?: SalesFittingStatus;
  };
  if (body.status && !STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "Invalid fitting status." }, { status: 400 });
  }
  const existing = readSalesWorkspace().fittings.find(
    (item) => item.id === String(body.fitting_id ?? "").trim()
  );
  if (!existing) return NextResponse.json({ error: "Fitting not found." }, { status: 404 });
  const fitting = await updateSalesFitting(existing.id, body, "api", "api");
  return NextResponse.json({ fitting });
}
