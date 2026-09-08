import { notFound } from "next/navigation";
import { CostHintWorksheetView } from "@/components/costing/CostHintWorksheetView";
import { canViewMoney } from "@/lib/auth/invoice-amounts-access";
import { getSessionContext } from "@/lib/auth/session";
import { costHintWorksheetQuery, parseCostHintWorksheetSearch } from "@/lib/costing/cost-hint-worksheet-query";
import { worksheetForCostHintDownload } from "@/lib/costing/cost-hint-worksheet";
import { loadCostHintWorksheet } from "@/lib/costing/load-cost-hint-worksheet";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function CostHintPrintPage({
  searchParams,
}: {
  searchParams: Promise<{
    invoice?: string;
    so?: string;
    brand?: string;
    archived?: string;
    missing?: string;
    clients?: string;
  }>;
}) {
  const session = await getSessionContext();
  if (!canViewMoney(session)) notFound();

  await ensureDocumentsLoaded(["sales_orders", "costing_rates", "customer_invoices", "clients"]);
  const parsed = parseCostHintWorksheetSearch(await searchParams);
  const loaded = loadCostHintWorksheet(parsed);
  const worksheet = loaded
    ? worksheetForCostHintDownload(loaded, { missingPrices: parsed.missingPrices })
    : null;
  if (!worksheet) notFound();

  return (
    <CostHintWorksheetView
      worksheet={worksheet}
      pdfHref={`/api/costing/hint-pdf${costHintWorksheetQuery(parsed)}`}
    />
  );
}
