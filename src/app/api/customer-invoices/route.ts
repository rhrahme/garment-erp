import { NextResponse } from "next/server";
import {
  getCustomerInvoiceSummary,
  listCustomerInvoicesSorted,
  readCustomerInvoices,
} from "@/lib/data/customer-invoices";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";

export async function GET() {
  try {
    await ensureDocumentsLoaded(["customer_invoices"]);
    const file = readCustomerInvoices();
    return NextResponse.json({
      ...file,
      invoices: listCustomerInvoicesSorted(),
      summary: getCustomerInvoiceSummary(file),
    });
  } catch (error) {
    console.error("Failed to read customer invoices:", error);
    return NextResponse.json({ error: "Failed to load invoices." }, { status: 500 });
  }
}
