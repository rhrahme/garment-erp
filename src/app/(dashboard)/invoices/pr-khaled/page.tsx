import { redirect } from "next/navigation";
import { readCustomerInvoicesFresh } from "@/lib/data/customer-invoices";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { hrefForNamedClientInvoices } from "@/lib/invoicing/named-client-invoice";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function PrKhaledInvoiceRedirectPage() {
  await ensureDocumentsLoaded(["customer_invoices"]);
  const store = await readCustomerInvoicesFresh();
  redirect(hrefForNamedClientInvoices(store.invoices, "khaled", "Khaled"));
}
