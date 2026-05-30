import {
  DHL_ADC_SENDER,
  DHL_PAYMENT_RECEIPT_SENDER,
  DHL_PAYMENT_RECEIPT_SUBJECT,
  isDhlAdcSender,
} from "@/lib/email/inbound/parse-transporter-email";
import type { TransporterInvoiceRecord } from "@/lib/integrations/transporter-invoice-store";

export type CustomsStatus = "paid" | "payment_due" | "pending" | "unknown";

export type CustomsSummary = {
  status: CustomsStatus;
  status_label: string;
  amount_due: string | null;
  amount_paid: string | null;
  currency: string | null;
  payment_url: string | null;
};

function normalizeAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
}

function isPaymentReceipt(doc: TransporterInvoiceRecord): boolean {
  const from = normalizeAddress(doc.from_address);
  return from === DHL_PAYMENT_RECEIPT_SENDER && DHL_PAYMENT_RECEIPT_SUBJECT.test(doc.subject);
}

function isCustomsDemand(doc: TransporterInvoiceRecord): boolean {
  if (isPaymentReceipt(doc)) return false;
  if (isDhlAdcSender(doc.from_address)) return true;
  if (/duty receipt|support documentation for awb|import export duties|payment due prior/i.test(doc.subject)) {
    return true;
  }
  if (doc.expense_type === "customs" && (doc.payment_url || doc.amount)) {
    const from = normalizeAddress(doc.from_address);
    if (from.includes("dhl.com") || from.includes("dhlexpress")) return true;
  }
  return false;
}

function isSupplierDuplicate(doc: TransporterInvoiceRecord): boolean {
  const from = normalizeAddress(doc.from_address);
  if (from.includes("loropiana.com")) return true;
  if (/^invoice\s+20\d{2}-v1/i.test(doc.subject) && !from.includes("dhl")) return true;
  return false;
}

export function filterTransporterDocs(docs: TransporterInvoiceRecord[]): TransporterInvoiceRecord[] {
  return docs.filter((doc) => !isSupplierDuplicate(doc));
}

function docsForCustoms(docs: TransporterInvoiceRecord[]): TransporterInvoiceRecord[] {
  return filterTransporterDocs(docs);
}

function matchesAwb(doc: TransporterInvoiceRecord, awbNumbers: string[]): boolean {
  if (!doc.awb_number) return true;
  return awbNumbers.includes(doc.awb_number);
}

export function computeCustomsSummary(
  awbNumbers: string[],
  transporterDocs: TransporterInvoiceRecord[]
): CustomsSummary {
  const docs = docsForCustoms(transporterDocs).filter((doc) => matchesAwb(doc, awbNumbers));

  const receipts = docs.filter(isPaymentReceipt);
  const demands = docs.filter(isCustomsDemand);

  const paidDoc = receipts.find((doc) => doc.amount && doc.currency) ?? receipts[0] ?? null;
  const dueDoc =
    demands.find((doc) => doc.amount && doc.currency) ??
    demands.find((doc) => doc.payment_url) ??
    demands[0] ??
    null;

  if (paidDoc?.amount) {
    return {
      status: "paid",
      status_label: "Customs paid",
      amount_due: null,
      amount_paid: paidDoc.amount,
      currency: paidDoc.currency ?? dueDoc?.currency ?? null,
      payment_url: dueDoc?.payment_url ?? null,
    };
  }

  if (dueDoc?.amount || dueDoc?.payment_url) {
    return {
      status: "payment_due",
      status_label: dueDoc.payment_url ? "Payment due — pay DHL" : "Payment due",
      amount_due: dueDoc.amount,
      amount_paid: null,
      currency: dueDoc.currency,
      payment_url: dueDoc.payment_url,
    };
  }

  if (demands.length > 0 || receipts.length > 0) {
    return {
      status: "unknown",
      status_label: "Customs — amount unknown",
      amount_due: null,
      amount_paid: null,
      currency: null,
      payment_url: dueDoc?.payment_url ?? null,
    };
  }

  return {
    status: "pending",
    status_label: "No customs invoice yet",
    amount_due: null,
    amount_paid: null,
    currency: null,
    payment_url: null,
  };
}

export function groupTransporterDocsByAwb(
  docs: TransporterInvoiceRecord[]
): Array<{
  awb_number: string | null;
  documents: TransporterInvoiceRecord[];
  customs_summary: CustomsSummary;
}> {
  const filtered = filterTransporterDocs(docs);
  const groups = new Map<string, TransporterInvoiceRecord[]>();

  for (const doc of filtered) {
    const key = doc.awb_number ?? doc.id;
    const list = groups.get(key) ?? [];
    list.push(doc);
    groups.set(key, list);
  }

  return [...groups.values()].map((documents) => {
    const awb_number = documents[0]?.awb_number ?? null;
    return {
      awb_number,
      documents: documents.sort((a, b) => b.received_at.localeCompare(a.received_at)),
      customs_summary: computeCustomsSummary(awb_number ? [awb_number] : [], documents),
    };
  });
}

export function transporterDocLabel(doc: TransporterInvoiceRecord): string {
  if (isPaymentReceipt(doc)) return "Payment receipt";
  if (isCustomsDemand(doc)) return "Customs invoice";
  if (doc.expense_type === "freight") return "Freight invoice";
  return doc.original_filename ?? "Document";
}

/** Link payment receipts to supplier invoices by AWB when stored unlinked */
export function findLinkedCustomsDocs(
  awbNumbers: string[],
  supplierInvoiceId: string,
  linkedDocs: TransporterInvoiceRecord[],
  allDocs: TransporterInvoiceRecord[]
): TransporterInvoiceRecord[] {
  const byId = new Map(linkedDocs.map((doc) => [doc.id, doc]));
  for (const doc of allDocs) {
    if (doc.supplier_invoice_id && doc.supplier_invoice_id !== supplierInvoiceId) continue;
    if (doc.supplier_invoice_id === supplierInvoiceId) {
      byId.set(doc.id, doc);
      continue;
    }
    if (doc.awb_number && awbNumbers.includes(doc.awb_number)) {
      byId.set(doc.id, doc);
    }
  }
  return [...byId.values()];
}
