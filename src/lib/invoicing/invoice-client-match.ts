type ClientRef = { client_id?: string | null; client_code?: string | null };

function normalize(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

/**
 * Older invoices and their sales orders do not always carry the same client_id,
 * so the client code counts as the same client too.
 */
export function salesOrderMatchesInvoiceClient(invoice: ClientRef, order: ClientRef): boolean {
  const invoiceId = normalize(invoice.client_id);
  const orderId = normalize(order.client_id);
  if (invoiceId && orderId && invoiceId === orderId) return true;

  const invoiceCode = normalize(invoice.client_code);
  const orderCode = normalize(order.client_code);
  return Boolean(invoiceCode) && invoiceCode === orderCode;
}
