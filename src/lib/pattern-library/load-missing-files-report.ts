import { readPatternJobsAsync } from "@/lib/data/pattern-jobs";
import { readPatternLibraryCached } from "@/lib/data/pattern-library";
import { readSalesOrdersAsync } from "@/lib/data/sales-orders";
import {
  buildMissingFilesReport,
  filterMissingFilesReport,
  type MissingFilesFilter,
  type MissingFilesReport,
} from "@/lib/pattern-library/missing-files-report";

export async function listMissingFilesReport(
  filter: MissingFilesFilter = "all"
): Promise<MissingFilesReport> {
  const [library, jobsFile, ordersFile] = await Promise.all([
    readPatternLibraryCached(),
    readPatternJobsAsync(),
    readSalesOrdersAsync(),
  ]);
  const report = buildMissingFilesReport({
    patterns: library.client_patterns,
    jobs: jobsFile.jobs,
    orders: ordersFile.orders,
  });
  return filterMissingFilesReport(report, filter);
}
