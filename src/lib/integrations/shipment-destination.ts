import type { SupplierInvoiceRecord } from "@/lib/integrations/supplier-invoice-store";
import type { SupplierReplyRecord } from "@/lib/integrations/supplier-reply-store";

export type ShipmentDestination = "RUH" | "DXB";

export type DestinationResolution = {
  destination: ShipmentDestination | null;
  source: "subject" | "reply" | "thread" | null;
};

export function detectDestinationFromText(text: string): ShipmentDestination | null {
  const haystack = text.toLowerCase();

  const ruh =
    /\briyadh\b/.test(haystack) ||
    /\bru[\s_-]?h\b/.test(haystack) ||
    /\b13791\b/.test(haystack) ||
    /\brkta5371\b/.test(haystack) ||
    /saudi arabia/.test(haystack) ||
    /hagan industrial/.test(haystack) ||
    /order to riyadh/.test(haystack) ||
    /ship(?:ped|p)?[^\n]{0,40}\bto riyadh\b/.test(haystack) ||
    /send[^\n]{0,40}\bto riyadh\b/.test(haystack);

  const dxb =
    /\bdubai\b/.test(haystack) ||
    /\bdxb\b/.test(haystack) ||
    /radisson/.test(haystack) ||
    /hagan uae/.test(haystack) ||
    /order to dubai/.test(haystack) ||
    /ship(?:ped|p)?[^\n]{0,40}\bto dubai\b/.test(haystack) ||
    /send[^\n]{0,40}\bto dubai\b/.test(haystack) ||
    /emirati arab/.test(haystack);

  if (ruh && !dxb) return "RUH";
  if (dxb && !ruh) return "DXB";
  if (!ruh && !dxb) return null;

  const riyadhIndex = Math.max(haystack.lastIndexOf("riyadh"), haystack.lastIndexOf("ruh"));
  const dubaiIndex = Math.max(haystack.lastIndexOf("dubai"), haystack.lastIndexOf("dxb"));
  return riyadhIndex > dubaiIndex ? "RUH" : "DXB";
}

function replyMatchesInvoice(reply: SupplierReplyRecord, invoice: SupplierInvoiceRecord): boolean {
  if (invoice.message_id && reply.message_id?.toLowerCase() === invoice.message_id.toLowerCase()) {
    return true;
  }

  if (invoice.invoice_number && reply.invoice_numbers?.includes(invoice.invoice_number)) {
    return true;
  }

  if (invoice.awb_numbers.length > 0) {
    return invoice.awb_numbers.some((awb) => reply.awb_numbers?.includes(awb));
  }

  return false;
}

export function resolveInvoiceDestination(
  invoice: SupplierInvoiceRecord,
  replies: SupplierReplyRecord[]
): DestinationResolution {
  const fromSubject = detectDestinationFromText(invoice.subject);
  if (fromSubject) {
    return { destination: fromSubject, source: "subject" };
  }

  for (const reply of replies) {
    if (!replyMatchesInvoice(reply, invoice)) continue;
    const fromReply = detectDestinationFromText(`${reply.subject}\n${reply.body}`);
    if (fromReply) {
      return { destination: fromReply, source: "reply" };
    }
  }

  if (invoice.supplier_id) {
    const cutoff = new Date(invoice.received_at);
    cutoff.setDate(cutoff.getDate() - 90);

    const threadReplies = replies
      .filter(
        (reply) =>
          reply.supplier_id === invoice.supplier_id &&
          reply.received_at <= invoice.received_at &&
          reply.received_at >= cutoff.toISOString()
      )
      .sort((a, b) => b.received_at.localeCompare(a.received_at));

    for (const reply of threadReplies) {
      const fromThreadSubject = detectDestinationFromText(reply.subject);
      if (fromThreadSubject) {
        return { destination: fromThreadSubject, source: "thread" };
      }
    }

    for (const reply of threadReplies) {
      const fromThreadBody = detectDestinationFromText(reply.body);
      if (fromThreadBody) {
        return { destination: fromThreadBody, source: "thread" };
      }
    }
  }

  return { destination: null, source: null };
}

export function resolveAwbDestination(
  awbNumber: string,
  replies: SupplierReplyRecord[]
): ShipmentDestination | null {
  for (const reply of replies) {
    if (!reply.awb_numbers?.includes(awbNumber)) continue;
    const destination = detectDestinationFromText(`${reply.subject}\n${reply.body}`);
    if (destination) return destination;
  }
  return null;
}

export function destinationLabel(destination: ShipmentDestination): string {
  return destination === "RUH" ? "Riyadh" : "Dubai";
}
