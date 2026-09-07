export function costHintWorksheetQuery(input: {
  invoiceId?: string | null;
  soNumber?: string | null;
  brandId?: string | null;
  includeArchived?: boolean;
}): string {
  const params = new URLSearchParams();
  if (input.invoiceId) params.set("invoice", input.invoiceId);
  if (input.soNumber) params.set("so", input.soNumber);
  if (input.brandId) params.set("brand", input.brandId);
  if (input.includeArchived) params.set("archived", "1");
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function parseCostHintWorksheetSearch(search: {
  invoice?: string;
  so?: string;
  brand?: string;
  archived?: string;
}): {
  invoiceId: string | null;
  soNumber: string | null;
  brandId: string | null;
  includeArchived: boolean;
} {
  return {
    invoiceId: search.invoice?.trim() || null,
    soNumber: search.so?.trim() || null,
    brandId: search.brand?.trim() || null,
    includeArchived: search.archived === "1" || search.archived === "true",
  };
}
