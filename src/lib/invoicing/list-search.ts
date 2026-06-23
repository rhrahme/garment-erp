/** Client-safe invoice list search — do not import server data modules here. */

type InvoiceSearchRow = {
  invoice_number: string;
  so_number: string;
  client_name: string;
  client_code: string;
  client_reference?: string | null;
};

function expandNameAliases(text: string): string {
  let expanded = text;
  if (/\babdel\b/.test(text) && /\baziz\b/.test(text)) {
    expanded += " abdulaziz abdelaziz";
  }
  if (/\babdulaziz\b/.test(text)) {
    expanded += " abdel aziz abdelaziz";
  }
  return expanded;
}

export function buildInvoiceSearchText(invoice: InvoiceSearchRow): string {
  const base = [
    invoice.invoice_number,
    invoice.so_number,
    invoice.client_name,
    invoice.client_code,
    invoice.client_reference,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return expandNameAliases(base);
}

export function customerInvoiceMatchesSearch(invoice: InvoiceSearchRow, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  const searchText = buildInvoiceSearchText(invoice);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  return tokens.every((token) => searchText.includes(token));
}
