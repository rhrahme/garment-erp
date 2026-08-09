import { notFound } from "next/navigation";
import {
  PatternOrderBatchPrintView,
  type PatternOrderBatchSheet,
} from "@/components/pattern/PatternOrderBatchPrintView";
import { getSessionContext } from "@/lib/auth/session";
import { ensurePatternDocumentsLoaded, listPatternJobsForOrder } from "@/lib/data/pattern-jobs";
import { getSalesOrderById } from "@/lib/data/sales-orders";
import {
  parsePatternSheetJobIds,
  parsePatternSheetKind,
} from "@/lib/pattern-library/pattern-sheet-kind";
import { buildPatternSheetData } from "@/lib/pattern-library/sheet-data";

export const dynamic = "force-dynamic";

function formatArticle(articleNumber: number): string {
  return `L${String(articleNumber).padStart(2, "0")}`;
}

type PageProps = {
  params: Promise<{ soId: string }>;
  searchParams: Promise<{ sheet?: string; jobs?: string }>;
};

export default async function PatternOrderBatchPrintPage({
  params,
  searchParams,
}: PageProps) {
  const { soId } = await params;
  const { sheet, jobs: jobsParam } = await searchParams;

  const session = await getSessionContext();
  if (!session.canAccessPattern) notFound();

  await ensurePatternDocumentsLoaded();
  const order = getSalesOrderById(soId);
  if (!order) notFound();

  const kind = parsePatternSheetKind(sheet);
  const requestedIds = parsePatternSheetJobIds(jobsParam);
  const orderJobs = listPatternJobsForOrder(soId);
  const byId = new Map(orderJobs.map((job) => [job.id, job]));
  const selected =
    requestedIds.length > 0
      ? requestedIds.map((id) => byId.get(id)).filter((job): job is NonNullable<typeof job> => Boolean(job))
      : [];

  const sheets: PatternOrderBatchSheet[] = [];
  const skipped: Array<{ articleLabel: string; reason: string }> = [];

  for (const job of selected) {
    const articleLabel = formatArticle(job.article_number);
    const patternId = job.client_pattern_id?.trim();
    if (!patternId) {
      skipped.push({
        articleLabel,
        reason: "no master pattern linked",
      });
      continue;
    }
    const data = await buildPatternSheetData(patternId, {
      jobId: job.id,
      lineId: job.sales_order_line_id,
    });
    if (!data) {
      skipped.push({
        articleLabel,
        reason: "could not load measurement sheet",
      });
      continue;
    }
    sheets.push({
      jobId: job.id,
      articleLabel,
      fabricNumber: job.fabric_number || data.fabric?.fabric_number || "-",
      data,
    });
  }

  return (
    <PatternOrderBatchPrintView
      soId={soId}
      soNumber={order.so_number}
      clientName={order.client_name}
      kind={kind}
      sheets={sheets}
      skipped={skipped}
    />
  );
}
