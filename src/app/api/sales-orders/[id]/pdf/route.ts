import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  FABRIC_PRICE_UNLOCK_COOKIE,
  hasFabricPriceAccess,
  redactSalesOrderFabricPrices,
} from "@/lib/auth/fabric-price-access";
import { requireAuthenticated } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { getSalesOrderById } from "@/lib/data/sales-orders";
import { generateSalesOrderPdf } from "@/lib/sales-orders/generate-pdf";
import { canAccessSalesOrder } from "@/lib/sales/access";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id } = await context.params;
    await ensureDocumentsLoaded(["clients", "sales_orders"]);
    const rawOrder = getSalesOrderById(id);
    if (!rawOrder) {
      return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
    }
    if (!canAccessSalesOrder(session, rawOrder)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const cookieStore = await cookies();
    const canViewFabricPrices = hasFabricPriceAccess(
      session,
      cookieStore.get(FABRIC_PRICE_UNLOCK_COOKIE)?.value
    );
    const order = canViewFabricPrices ? rawOrder : redactSalesOrderFabricPrices(rawOrder);
    const pdfBytes = await generateSalesOrderPdf(order, { showPrices: canViewFabricPrices });

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${rawOrder.so_number}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Failed to generate sales order PDF:", error);
    return NextResponse.json({ error: "Failed to generate PDF." }, { status: 500 });
  }
}
