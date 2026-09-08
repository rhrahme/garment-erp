import { parseCostHintClientTokens } from "@/lib/costing/cost-hint-clients";

export function costHintWorksheetQuery(input: {
  invoiceId?: string | null;
  soNumber?: string | null;
  brandId?: string | null;
  includeArchived?: boolean;
  missingPrices?: boolean;
  clientTokens?: string[] | null;
}): string {
  const params = new URLSearchParams();
  if (input.invoiceId) params.set("invoice", input.invoiceId);
  if (input.soNumber) params.set("so", input.soNumber);
  if (input.brandId) params.set("brand", input.brandId);
  if (input.includeArchived) params.set("archived", "1");
  if (input.missingPrices) params.set("missing", "1");
  if (input.clientTokens && input.clientTokens.length > 0) {
    params.set("clients", input.clientTokens.join(","));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function parseCostHintWorksheetSearch(search: {
  invoice?: string;
  so?: string;
  brand?: string;
  archived?: string;
  missing?: string;
  clients?: string;
}): {
  invoiceId: string | null;
  soNumber: string | null;
  brandId: string | null;
  includeArchived: boolean;
  missingPrices: boolean;
  clientTokens: string[];
} {
  return {
    invoiceId: search.invoice?.trim() || null,
    soNumber: search.so?.trim() || null,
    brandId: search.brand?.trim() || null,
    includeArchived: search.archived === "1" || search.archived === "true",
    missingPrices: search.missing === "1" || search.missing === "true",
    clientTokens: parseCostHintClientTokens(search.clients),
  };
}
