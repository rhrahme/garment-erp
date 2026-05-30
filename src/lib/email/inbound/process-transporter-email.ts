import type { EmailAttachmentInput } from "@/lib/email/inbound/parse-invoice-pdf";
import { isTrustedTransporterSource } from "@/lib/email/inbound/parse-transporter-email";
import { isEmailProcessed, markEmailProcessed } from "@/lib/integrations/processed-email-store";
import { relinkTransporterInvoicesByAwb } from "@/lib/integrations/transporter-invoice-store";
import { saveTransporterInvoicesFromEmail } from "@/lib/email/inbound/save-transporter-invoices";
import type { TransporterInvoiceRecord } from "@/lib/integrations/transporter-invoice-store";

export type TransporterEmailInput = {
  message_id: string;
  from_address: string;
  subject: string;
  body: string;
  received_at: string;
  attachments: EmailAttachmentInput[];
};

export type ProcessedTransporterEmail = {
  transporter_invoices_saved: number;
  invoices: TransporterInvoiceRecord[];
  skipped: boolean;
  reason?: string;
};

function hasPdfAttachments(attachments: EmailAttachmentInput[]): boolean {
  return attachments.some(
    (attachment) => /\.pdf$/i.test(attachment.filename) && attachment.content.length > 0
  );
}

export async function processTransporterEmail(
  input: TransporterEmailInput
): Promise<ProcessedTransporterEmail> {
  const pdfAttachments = hasPdfAttachments(input.attachments);
  const alreadyProcessed = isEmailProcessed(`transporter:${input.message_id}`);

  if (alreadyProcessed && !pdfAttachments && !isTrustedTransporterSource(input.from_address, input.subject)) {
    return {
      transporter_invoices_saved: 0,
      invoices: [],
      skipped: true,
      reason: "Already processed",
    };
  }

  const saved = await saveTransporterInvoicesFromEmail({
    subject: input.subject,
    from_address: input.from_address,
    received_at: input.received_at,
    message_id: input.message_id,
    body: input.body,
    attachments: input.attachments,
  });

  relinkTransporterInvoicesByAwb();

  if (saved.length > 0) {
    markEmailProcessed(`transporter:${input.message_id}`);
  } else if (!isTrustedTransporterSource(input.from_address, input.subject)) {
    markEmailProcessed(`transporter:${input.message_id}`);
  }

  return {
    transporter_invoices_saved: saved.length,
    invoices: saved,
    skipped: saved.length === 0,
    reason: saved.length === 0 ? "No transporter invoice PDFs found" : undefined,
  };
}
