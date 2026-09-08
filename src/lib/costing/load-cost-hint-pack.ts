import {
  COST_HINT_NAMED_CLIENTS,
  matchesCostHintClientFilter,
  resolveCostHintNamedClient,
} from "@/lib/costing/cost-hint-clients";
import { generateCostHintWorksheetPdf } from "@/lib/costing/generate-cost-hint-worksheet-pdf";
import {
  formatCostHintArticleSummary,
  summarizeCostHintArticles,
  type CostHintWorksheet,
} from "@/lib/costing/cost-hint-worksheet";
import { loadCostHintWorksheet } from "@/lib/costing/load-cost-hint-worksheet";
import { buildDownloadFilename } from "@/lib/pdf/download-filename";
import { buildZipBuffer } from "@/lib/utils/create-zip";

export type CostHintPackQuery = {
  invoiceId?: string | null;
  soNumber?: string | null;
  brandId?: string | null;
  includeArchived?: boolean;
  clientTokens?: string[];
};

function clientLabelForRows(rows: CostHintWorksheet["rows"], token: string): string {
  const named = resolveCostHintNamedClient(token);
  const first = rows[0];
  return named?.label ?? first?.client_name ?? token;
}

function worksheetsByClient(
  combined: CostHintWorksheet,
  tokens: string[]
): Array<{ token: string; label: string; worksheet: CostHintWorksheet }> {
  const packs: Array<{ token: string; label: string; worksheet: CostHintWorksheet }> = [];
  for (const token of tokens) {
    const rows = combined.rows.filter((row) =>
      matchesCostHintClientFilter(row.client_name, row.client_code, [token])
    );
    if (rows.length === 0) continue;
    const label = clientLabelForRows(rows, token);
    packs.push({
      token,
      label,
      worksheet: {
        ...combined,
        subtitle: `Internal. Do not send to the client. ${label}. Cost hint = fabric + 5% duty + make, per piece. VAT excluded.`,
        rows,
        missing_price_count: rows.filter((row) => row.missing_price).length,
        article_summary: formatCostHintArticleSummary(summarizeCostHintArticles(rows)),
      },
    });
  }
  return packs;
}

export function costHintPackZipFilename(labels: string[]): string {
  return buildDownloadFilename(["cost-hints", ...labels], "zip");
}

export async function loadCostHintClientPack(query: CostHintPackQuery): Promise<{
  zip: Buffer;
  filename: string;
  labels: string[];
} | null> {
  const tokens = query.clientTokens ?? [];
  if (tokens.length === 0) return null;

  const combined = loadCostHintWorksheet({
    soNumber: query.soNumber,
    brandId: query.brandId,
    includeArchived: query.includeArchived,
    clientTokens: tokens,
  });
  if (!combined) return null;

  const groups = worksheetsByClient(combined, tokens);
  if (groups.length === 0) return null;

  const entries = await Promise.all(
    groups.map(async (group) => {
      const pdf = await generateCostHintWorksheetPdf(group.worksheet);
      return {
        name: buildDownloadFilename(["cost-hints", group.label]),
        data: Buffer.from(pdf),
      };
    })
  );

  return {
    zip: buildZipBuffer(entries),
    filename: costHintPackZipFilename(groups.map((group) => group.label)),
    labels: groups.map((group) => group.label),
  };
}

export function costHintNamedClientPackTokens(): string[] {
  return COST_HINT_NAMED_CLIENTS.map((client) => client.key);
}
