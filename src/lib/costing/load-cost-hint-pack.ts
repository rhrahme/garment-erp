import {
  COST_HINT_NAMED_CLIENTS,
  matchesCostHintClientFilter,
  resolveCostHintNamedClient,
} from "@/lib/costing/cost-hint-clients";
import { generateCostHintWorksheetPdf } from "@/lib/costing/generate-cost-hint-worksheet-pdf";
import {
  costHintNamedClientPackFiles,
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

export type CostHintClientPack = {
  zip: Buffer;
  filename: string;
  labels: string[];
  files: string[];
  singlePdf: { bytes: Buffer; filename: string } | null;
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
        rows,
        missing_price_count: rows.filter((row) => row.missing_price).length,
      },
    });
  }
  return packs;
}

export function costHintPackZipFilename(labels: string[]): string {
  return buildDownloadFilename(["cost-hints", ...labels], "zip");
}

export async function loadCostHintClientPack(query: CostHintPackQuery): Promise<CostHintClientPack | null> {
  const tokens = query.clientTokens ?? [];
  if (tokens.length === 0) return null;

  const combined = loadCostHintWorksheet({
    soNumber: query.soNumber,
    includeArchived: true,
    clientTokens: tokens,
  });
  if (!combined) return null;

  const groups = worksheetsByClient(combined, tokens);
  if (groups.length === 0) return null;

  const files = groups.flatMap((group) => costHintNamedClientPackFiles(group.worksheet, group.label));
  const entries = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      data: Buffer.from(await generateCostHintWorksheetPdf(file.worksheet)),
    }))
  );

  return {
    zip: buildZipBuffer(entries),
    filename: costHintPackZipFilename(groups.map((group) => group.label)),
    labels: groups.map((group) => group.label),
    files: entries.map((entry) => entry.name),
    singlePdf: entries.length === 1 ? { bytes: entries[0].data, filename: entries[0].name } : null,
  };
}

export function costHintNamedClientPackTokens(): string[] {
  return COST_HINT_NAMED_CLIENTS.map((client) => client.key);
}
