import { matchesCostHintClientFilter } from "@/lib/costing/cost-hint-clients";

type NamedClientInvoice = {
  id: string;
  client_name: string;
  client_code: string;
};

export function invoicesForNamedClient<T extends NamedClientInvoice>(
  invoices: T[],
  token: string
): T[] {
  return invoices.filter((invoice) =>
    matchesCostHintClientFilter(invoice.client_name, invoice.client_code, [token])
  );
}

/** One matching invoice opens it. Several (or none) stay on the Invoicing list. */
export function hrefForNamedClientInvoices(
  invoices: NamedClientInvoice[],
  token: string,
  query: string
): string {
  const matches = invoicesForNamedClient(invoices, token);
  if (matches.length === 1) return `/invoices/${matches[0]!.id}`;
  return `/invoices?q=${encodeURIComponent(query)}`;
}
