import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { getSalesOrderByIdFresh } from "@/lib/data/sales-orders";
import { readSalesWorkspace } from "@/lib/data/sales-workspace";
import { canAccessSalesOrder } from "@/lib/sales/access";
import { createSalesFitting, updateSalesFitting } from "@/lib/sales/mutations";
import type { SalesFittingStatus } from "@/lib/types/sales-workspace";

const STATUSES: SalesFittingStatus[] = ["scheduled", "done", "no_show", "cancelled"];

export async function POST(request: Request) {
  const session = await requireAuthenticated();
  if (!session || (!session.isSalesOperator && !session.isAdmin)) {
    return NextResponse.json({ error: "Sales access required." }, { status: 403 });
  }
  await ensureDocumentsLoaded(["clients", "sales_orders", "sales_workspace"]);
  const body = (await request.json()) as {
    sales_order_id?: string;
    scheduled_at?: string;
    notes?: string | null;
  };
  const order = await getSalesOrderByIdFresh(String(body.sales_order_id ?? "").trim());
  if (!order) return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
  if (!canAccessSalesOrder(session, order)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const scheduledAt = String(body.scheduled_at ?? "").trim();
  if (!scheduledAt || Number.isNaN(Date.parse(scheduledAt))) {
    return NextResponse.json({ error: "A valid fitting date is required." }, { status: 400 });
  }
  const fitting = await createSalesFitting(
    order.id,
    order.client_id,
    scheduledAt,
    String(body.notes ?? "").trim() || null,
    session.email
  );
  return NextResponse.json({ fitting }, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = await requireAuthenticated();
  if (!session || (!session.isSalesOperator && !session.isAdmin)) {
    return NextResponse.json({ error: "Sales access required." }, { status: 403 });
  }
  await ensureDocumentsLoaded(["clients", "sales_orders", "sales_workspace"]);
  const body = (await request.json()) as {
    fitting_id?: string;
    scheduled_at?: string;
    notes?: string | null;
    status?: SalesFittingStatus;
  };
  const existing = readSalesWorkspace().fittings.find(
    (item) => item.id === String(body.fitting_id ?? "").trim()
  );
  if (!existing) return NextResponse.json({ error: "Fitting not found." }, { status: 404 });
  const order = await getSalesOrderByIdFresh(existing.sales_order_id);
  if (!order || !canAccessSalesOrder(session, order)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (body.status && !STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "Invalid fitting status." }, { status: 400 });
  }
  const fitting = await updateSalesFitting(
    existing.id,
    {
      scheduled_at: body.scheduled_at,
      notes: body.notes,
      status: body.status,
    },
    session.email
  );
  return NextResponse.json({ fitting });
}
