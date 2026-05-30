import { getSupplierDefaultCarrier } from "@/lib/data/supplier-catalogs";
import {
  parseInvoiceAttachments,
  type EmailAttachmentInput,
} from "@/lib/email/inbound/parse-invoice-pdf";
import { parseSupplierEmailContent } from "@/lib/email/inbound/parse-supplier-email";
import { parseAvailabilityFromEmail } from "@/lib/email/inbound/parse-availability-from-email";
import { listStoredFabricOrders } from "@/lib/integrations/fabric-order-store";
import { markEmailProcessed, isEmailProcessed } from "@/lib/integrations/processed-email-store";
import { createShipment, getShipmentByAwb } from "@/lib/integrations/shipment-store";
import { registerShipmentWith17Track } from "@/lib/integrations/track17/sync-shipments";
import { isTrack17Configured } from "@/lib/integrations/track17/config";
import { upsertSupplierReply, type SupplierReplyRecord } from "@/lib/integrations/supplier-reply-store";
import { createAvailabilityAlertsFromReply } from "@/lib/integrations/supplier-availability-store";
import { notifyAdminsOfAvailabilityAlerts } from "@/lib/integrations/supplier-availability-alert";
import { saveInvoiceAttachmentsFromEmail } from "@/lib/email/inbound/save-invoice-attachments";
import { notifyIntegration } from "@/lib/integrations";
import { findSupplierIdByEmail } from "@/lib/email/inbound/supplier-email-match";

export { findSupplierIdByEmail } from "@/lib/email/inbound/supplier-email-match";

export type InboundEmailInput = {
  message_id: string;
  from_address: string;
  subject: string;
  body: string;
  received_at: string;
  attachment_names?: string[];
  attachments?: EmailAttachmentInput[];
};

export type ProcessedInboundEmail = {
  reply: SupplierReplyRecord;
  shipments_created: number;
  invoices_saved: number;
  availability_alerts_created: number;
  skipped: boolean;
  reason?: string;
};

function normalizeAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function findFabricOrderByPoNumber(poNumber: string) {
  return listStoredFabricOrders().find((order) => order.po_number.toUpperCase() === poNumber.toUpperCase());
}

function hasPdfAttachments(attachments: EmailAttachmentInput[] | undefined): boolean {
  return (attachments ?? []).some(
    (attachment) => /\.pdf$/i.test(attachment.filename) && attachment.content.length > 0
  );
}

export async function processInboundSupplierEmail(input: InboundEmailInput): Promise<ProcessedInboundEmail> {
  const pdfAttachments = hasPdfAttachments(input.attachments);
  const alreadyProcessed = isEmailProcessed(input.message_id);

  if (alreadyProcessed && !pdfAttachments) {
    const existing = {
      id: `skipped-${input.message_id}`,
      po_number: null,
      supplier_id: null,
      from_address: input.from_address,
      subject: input.subject,
      body: input.body,
      received_at: input.received_at,
      message_id: input.message_id,
      awb_numbers: [],
      invoice_numbers: [],
      attachment_names: input.attachment_names ?? [],
      purchase_order_id: null,
    } satisfies SupplierReplyRecord;

    return { reply: existing, shipments_created: 0, invoices_saved: 0, availability_alerts_created: 0, skipped: true, reason: "Already processed" };
  }

  const parsed = parseSupplierEmailContent(input.subject, input.body);
  const fromPdfs = await parseInvoiceAttachments(input.attachments ?? []);
  const awb_numbers = unique([...parsed.awb_numbers, ...fromPdfs.awb_numbers]);
  const invoice_numbers = unique([...parsed.invoice_numbers, ...fromPdfs.invoice_numbers]);
  const carrier = parsed.carrier;

  const supplier_id = findSupplierIdByEmail(input.from_address);
  const matchedOrder = parsed.po_numbers.map((po) => findFabricOrderByPoNumber(po)).find(Boolean) ?? null;
  const po_number = matchedOrder?.po_number ?? parsed.po_numbers[0] ?? null;

  const line_updates = parseAvailabilityFromEmail(
    input.subject,
    input.body,
    matchedOrder?.lines ?? []
  );

  const reply = upsertSupplierReply({
    po_number,
    supplier_id: supplier_id ?? matchedOrder?.supplier_id ?? null,
    from_address: input.from_address,
    subject: input.subject,
    body: input.body,
    received_at: input.received_at,
    message_id: input.message_id,
    awb_numbers,
    invoice_numbers,
    attachment_names: input.attachment_names ?? [],
    purchase_order_id: matchedOrder?.id ?? null,
    line_updates,
  });

  const availabilityAlerts = createAvailabilityAlertsFromReply({
    reply_id: reply.id,
    po_number: reply.po_number,
    purchase_order_id: reply.purchase_order_id ?? null,
    supplier_id: reply.supplier_id,
    email_subject: reply.subject,
    line_updates: reply.line_updates ?? [],
  });

  if (availabilityAlerts.length > 0) {
    void notifyAdminsOfAvailabilityAlerts(availabilityAlerts);
  }

  let shipments_created = 0;
  const shipmentCarrier =
    getSupplierDefaultCarrier(supplier_id ?? matchedOrder?.supplier_id) ?? carrier;

  for (const awb_number of awb_numbers) {
    if (getShipmentByAwb(awb_number)) continue;

    const created = createShipment({
      awb_number,
      carrier: shipmentCarrier,
      purchase_order_id: matchedOrder?.id ?? null,
      po_number,
      status: "in_transit",
      direction: "inbound",
      estimated_arrival: null,
    });
    shipments_created += 1;

    if (isTrack17Configured()) {
      void registerShipmentWith17Track(created).catch((error) => {
        console.error("17TRACK register failed:", error);
      });
    }
  }

  const savedInvoices = await saveInvoiceAttachmentsFromEmail({
    supplier_id: supplier_id ?? matchedOrder?.supplier_id ?? null,
    subject: input.subject,
    from_address: input.from_address,
    received_at: input.received_at,
    message_id: input.message_id,
    po_number,
    invoice_numbers,
    awb_numbers,
    attachments: input.attachments ?? [],
  });

  if (!alreadyProcessed) {
    markEmailProcessed(input.message_id);
  }

  void notifyIntegration("supplier.reply_logged", {
    id: reply.id,
    po_number: reply.po_number,
    supplier_id: reply.supplier_id,
    awb_numbers: reply.awb_numbers,
    invoice_numbers: reply.invoice_numbers,
    line_update_count: reply.line_updates?.length ?? 0,
  });

  if (availabilityAlerts.length > 0) {
    void notifyIntegration("supplier.availability_detected", {
      reply_id: reply.id,
      po_number: reply.po_number,
      supplier_id: reply.supplier_id,
      alert_count: availabilityAlerts.length,
      fabrics: availabilityAlerts.map((alert) => alert.fabric_number),
    });
  }

  if (shipments_created > 0) {
    void notifyIntegration("awb.received", {
      po_number: reply.po_number,
      awb_numbers: reply.awb_numbers,
      count: shipments_created,
    });
  }

  if (savedInvoices.length > 0) {
    void notifyIntegration("supplier.invoice_saved", {
      count: savedInvoices.length,
      invoice_ids: savedInvoices.map((invoice) => invoice.id),
      supplier_id: reply.supplier_id,
    });
  }

  return {
    reply,
    shipments_created,
    invoices_saved: savedInvoices.length,
    availability_alerts_created: availabilityAlerts.length,
    skipped: false,
  };
}
