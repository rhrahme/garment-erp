import { formatMoneyDisplay } from "@/lib/email/inbound/parse-invoice-amount";
import {
  computeCustomsSummary,
  filterTransporterDocs,
  findLinkedCustomsDocs,
  type CustomsSummary,
} from "@/lib/integrations/customs-summary";
import { getShipmentByAwb, type ShipmentRecord } from "@/lib/integrations/shipment-store";
import type { TransporterInvoiceRecord } from "@/lib/integrations/transporter-invoice-store";

export type AwbDetailBlock = {
  awb_number: string;
  shipment: ShipmentRecord | null;
  tracking_status_label: string;
  tracking_location: string | null;
  latest_event: string | null;
  tracking_url: string | null;
  transporter_documents: TransporterInvoiceRecord[];
  customs_summary: CustomsSummary & {
    amount_due_display: string | null;
    amount_paid_display: string | null;
  };
};

function trackingStatusLabel(shipment: ShipmentRecord | null): string {
  if (!shipment) return "Not tracked yet";
  if (shipment.tracking_status) {
    return shipment.tracking_status.replace(/([A-Z])/g, " $1").trim();
  }
  if (shipment.status === "delivered") return "Delivered";
  if (shipment.status === "in_transit") return "In transit";
  return shipment.status.replace(/_/g, " ");
}

function withCustomsDisplays(summary: CustomsSummary): AwbDetailBlock["customs_summary"] {
  return {
    ...summary,
    amount_due_display: formatMoneyDisplay(summary.currency, summary.amount_due),
    amount_paid_display: formatMoneyDisplay(summary.currency, summary.amount_paid),
  };
}

export function buildAwbDetailBlock(
  awbNumber: string,
  transporterDocs: TransporterInvoiceRecord[]
): AwbDetailBlock {
  const shipment = getShipmentByAwb(awbNumber) ?? null;
  const docsForAwb = filterTransporterDocs(
    transporterDocs.filter((doc) => !doc.awb_number || doc.awb_number === awbNumber)
  );
  const customs_summary = withCustomsDisplays(
    computeCustomsSummary([awbNumber], docsForAwb)
  );

  return {
    awb_number: awbNumber,
    shipment,
    tracking_status_label: trackingStatusLabel(shipment),
    tracking_location: shipment?.current_location ?? null,
    latest_event: shipment?.latest_event ?? null,
    tracking_url: shipment?.tracking_url ?? null,
    transporter_documents: docsForAwb,
    customs_summary,
  };
}

export function buildAwbDetailsForInvoice(input: {
  awb_numbers: string[];
  supplier_invoice_id: string;
  linked_transporter: TransporterInvoiceRecord[];
  all_transporter: TransporterInvoiceRecord[];
}): AwbDetailBlock[] {
  const merged = filterTransporterDocs(
    findLinkedCustomsDocs(
      input.awb_numbers,
      input.supplier_invoice_id,
      input.linked_transporter,
      input.all_transporter
    )
  );

  if (input.awb_numbers.length === 0) {
    return [];
  }

  return input.awb_numbers.map((awb_number) => buildAwbDetailBlock(awb_number, merged));
}

export function buildOrphanAwbBlocks(
  unlinkedDocs: TransporterInvoiceRecord[]
): AwbDetailBlock[] {
  const byAwb = new Map<string, TransporterInvoiceRecord[]>();
  for (const doc of filterTransporterDocs(unlinkedDocs)) {
    const key = doc.awb_number ?? doc.id;
    const list = byAwb.get(key) ?? [];
    list.push(doc);
    byAwb.set(key, list);
  }

  return [...byAwb.entries()].map(([key, docs]) => {
    const awb_number = docs[0]?.awb_number ?? key;
    return buildAwbDetailBlock(awb_number, docs);
  });
}
