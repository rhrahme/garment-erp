import { NextResponse } from "next/server";
import { requirePatternAccess } from "@/lib/auth/session";
import { ensurePatternDocumentsLoaded, listPatternJobsForOrder, readPatternJobs } from "@/lib/data/pattern-jobs";
import { getSalesOrderById } from "@/lib/data/sales-orders";
import { detectPatternSalesOrderMismatch } from "@/lib/sales-orders/pattern-so-mismatch";
import { redactSalesOrderFabricPrices } from "@/lib/auth/fabric-price-access";
import { resolveFabricPriceAccess } from "@/lib/auth/fabric-price-access.server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { fabricLineScanStagesForLines } from "@/lib/production/fabric-receiving";

export async function GET(_request: Request, context: { params: Promise<{ soId: string }> }) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }

    await ensurePatternDocumentsLoaded();
    await ensureDocumentsLoaded(["sales_orders", "fabric_receipts", "production_work_orders"]);

    const { soId } = await context.params;
    const order = getSalesOrderById(soId);
    if (!order) {
      return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
    }

    const jobs = listPatternJobsForOrder(soId).filter((job) => job.status !== "cancelled");
    const lineById = new Map(order.fabric_lines.map((line) => [line.id, line]));
    // Enrich older jobs that predate supplier_id so fabric swatches resolve.
    const jobsWithSupplier = jobs.map((job) => ({
      ...job,
      supplier_id:
        job.supplier_id ?? lineById.get(job.sales_order_line_id)?.supplier_id ?? null,
    }));
    const canViewFabricPrices = await resolveFabricPriceAccess(session);
    const safeOrder = canViewFabricPrices ? order : redactSalesOrderFabricPrices(order);
    const mismatch = detectPatternSalesOrderMismatch(order, readPatternJobs().jobs);

    // Read-only fabric status per line so Pattern can see arrived / washing /
    // cutting without access to the Fabric Receiving floor.
    const fabric_line_status = fabricLineScanStagesForLines(
      order.fabric_lines.map((line) => line.id)
    );

    return NextResponse.json({
      order: safeOrder,
      jobs: jobsWithSupplier,
      awaiting_lines: order.fabric_lines.length === 0,
      mismatch,
      fabric_line_status,
    });
  } catch (error) {
    console.error("Failed to load pattern order board:", error);
    return NextResponse.json({ error: "Failed to load pattern order." }, { status: 500 });
  }
}
