import { getAllSuppliersFromContacts } from "@/lib/data/supplier-contacts";
import {
  parseInvoicePdfAttachment,
  type EmailAttachmentInput,
} from "@/lib/email/inbound/parse-invoice-pdf";
import {
  isInvoicePdfAttachment,
  pickInvoiceNumber,
  saveSupplierInvoiceFile,
  type SupplierInvoiceRecord,
} from "@/lib/integrations/supplier-invoice-store";
import { findSupplierIdByEmail } from "@/lib/email/inbound/process-supplier-email";

async function supplierName(supplierId: string | null): Promise<string | null> {
  if (!supplierId) return null;
  const suppliers = await getAllSuppliersFromContacts();
  return suppliers.find((supplier) => supplier.id === supplierId)?.name ?? null;
}

export async function saveInvoiceAttachmentsFromEmail(input: {
  supplier_id: string | null;
  subject: string;
  from_address: string;
  received_at: string;
  message_id: string;
  po_number: string | null;
  invoice_numbers: string[];
  awb_numbers: string[];
  attachments: EmailAttachmentInput[];
}): Promise<SupplierInvoiceRecord[]> {
  const saved: SupplierInvoiceRecord[] = [];

  const fromKnownSupplier = Boolean(findSupplierIdByEmail(input.from_address));

  for (const attachment of input.attachments) {
    if (!isInvoicePdfAttachment(attachment.filename, input.subject, fromKnownSupplier)) continue;

    const parsed = await parseInvoicePdfAttachment(attachment);

    const record = await saveSupplierInvoiceFile({
      supplier_id: input.supplier_id,
      supplier_name: await supplierName(input.supplier_id),
      invoice_number: pickInvoiceNumber(input.subject, [
        ...input.invoice_numbers,
        ...parsed.invoice_numbers,
      ]),
      amount: parsed.amount,
      currency: parsed.currency,
      awb_numbers: [...new Set([...input.awb_numbers, ...parsed.awb_numbers])],
      po_number: input.po_number,
      subject: input.subject,
      from_address: input.from_address,
      received_at: input.received_at,
      message_id: input.message_id,
      original_filename: attachment.filename,
      content: attachment.content,
    });

    if (record) saved.push(record);
  }

  return saved;
}
