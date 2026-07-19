import { NextResponse } from "next/server";
import { getSalesOrderByIdFresh } from "@/lib/data/sales-orders";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { updateSalesMilestone } from "@/lib/sales/mutations";
import type { SalesMilestone } from "@/lib/types/sales-workspace";

export async function PATCH(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;
  const body = (await request.json()) as {
    sales_order_id?: string;
    milestone?: SalesMilestone;
    acknowledge?: boolean;
  };
  const order = await getSalesOrderByIdFresh(String(body.sales_order_id ?? "").trim());
  if (!order) return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
  if (!body.milestone) {
    return NextResponse.json({ error: "milestone is required." }, { status: 400 });
  }
  await ensureDocumentsLoaded(["sales_workspace"]);
  try {
    const milestone = await updateSalesMilestone(
      order.id,
      body.milestone,
      "api",
      Boolean(body.acknowledge),
      "api"
    );
    return NextResponse.json({ milestone });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid milestone." },
      { status: 400 }
    );
  }
}
