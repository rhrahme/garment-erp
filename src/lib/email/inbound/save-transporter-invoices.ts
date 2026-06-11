import type { EmailAttachmentInput } from "@/lib/email/inbound/parse-invoice-pdf";
import { parseInvoicePdfAttachment } from "@/lib/email/inbound/parse-invoice-pdf";
import {
  isDhlPaymentReceiptEmail,
  isTransporterPdfAttachment,
  parseTransporterEmailContent,
} from "@/lib/email/inbound/parse-transporter-email";
import {
  saveTransporterInvoiceFile,
  type TransporterInvoiceRecord,
} from "@/lib/integrations/transporter-invoice-store";

export async function saveTransporterInvoicesFromEmail(input: {
  subject: string;
  from_address: string;
  received_at: string;
  message_id: string;
  body: string;
  attachments: EmailAttachmentInput[];
}): Promise<TransporterInvoiceRecord[]> {
  const parsed = parseTransporterEmailContent(input.subject, input.body, input.from_address);
  let awb_number = parsed.awb_numbers[0] ?? null;
  const invoice_number = parsed.invoice_numbers[0] ?? null;
  let amount = parsed.amount;
  let currency = parsed.currency;
  const saved: TransporterInvoiceRecord[] = [];

  for (const attachment of input.attachments) {
    if (!isTransporterPdfAttachment(attachment.filename, input.subject, input.from_address)) continue;

    const fromPdf = await parseInvoicePdfAttachment(attachment);
    if (!awb_number && fromPdf.awb_numbers[0]) awb_number = fromPdf.awb_numbers[0];
    if (!amount && fromPdf.amount) {
      amount = fromPdf.amount;
      currency = fromPdf.currency;
    }

    const record = await saveTransporterInvoiceFile({
      carrier: parsed.carrier,
      awb_number,
      invoice_number,
      expense_type: parsed.expense_type,
      amount,
      currency,
      payment_url: parsed.payment_url,
      subject: input.subject,
      from_address: input.from_address,
      received_at: input.received_at,
      message_id: input.message_id,
      original_filename: attachment.filename,
      content: attachment.content,
      source: "email_scan",
    });

    if (record) saved.push(record);
  }

  if (saved.length === 0 && parsed.payment_url) {
    const record = await saveTransporterInvoiceFile({
      carrier: parsed.carrier,
      awb_number,
      invoice_number,
      expense_type: parsed.expense_type,
      amount,
      currency,
      payment_url: parsed.payment_url,
      subject: input.subject,
      from_address: input.from_address,
      received_at: input.received_at,
      message_id: input.message_id,
      original_filename: null,
      content: null,
      source: "email_scan",
    });
    if (record) saved.push(record);
  }

  const isPaymentReceipt = isDhlPaymentReceiptEmail(input.from_address, input.subject);
  if (saved.length === 0 && isPaymentReceipt && (parsed.amount || awb_number)) {
    const record = await saveTransporterInvoiceFile({
      carrier: parsed.carrier,
      awb_number,
      invoice_number,
      expense_type: "customs",
      amount,
      currency,
      payment_url: parsed.payment_url,
      subject: input.subject,
      from_address: input.from_address,
      received_at: input.received_at,
      message_id: input.message_id,
      original_filename: null,
      content: null,
      source: "email_scan",
    });
    if (record) saved.push(record);
  }

  return saved;
}
