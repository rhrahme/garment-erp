import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { getSalesOrderByIdFresh } from "@/lib/data/sales-orders";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { canAccessSalesOrder } from "@/lib/sales/access";
import { updateSalesMilestone } from "@/lib/sales/mutations";
import type { SalesMilestone } from "@/lib/types/sales-workspace";

export async function PATCH(request: Request) {
  const session = await requireAuthenticated();
  if (!session || (!session.isSalesOperator && !session.isAdmin)) {
    return NextResponse.json({ error: "Sales access required." }, { status: 403 });
  }
  await ensureDocumentsLoaded(["clients", "sales_orders", "sales_workspace"]);
  const body = (await request.json()) as {
    sales_order_id?: string;
    milestone?: SalesMilestone;
    acknowledge?: boolean;
  };
  const order = await getSalesOrderByIdFresh(String(body.sales_order_id ?? "").trim());
  if (!order) return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
  if (!canAccessSalesOrder(session, order)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (!body.milestone) {
    return NextResponse.json({ error: "milestone is required." }, { status: 400 });
  }
  try {
    const milestone = await updateSalesMilestone(
      order.id,
      body.milestone,
      session.email,
      Boolean(body.acknowledge)
    );
    return NextResponse.json({ milestone });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid milestone." },
      { status: 400 }
    );
  }
}
