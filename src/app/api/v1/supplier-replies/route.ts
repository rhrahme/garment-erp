import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { createInboundShipmentFromAwb } from "@/lib/integrations/create-inbound-shipment";
import { ensureFabricOrdersLoaded, listStoredFabricOrders } from "@/lib/integrations/fabric-order-store";
import { ensureShipmentsLoaded, getShipmentByAwb } from "@/lib/integrations/shipment-store";
import {
  ensureSupplierRepliesLoaded,
  logSupplierReply,
} from "@/lib/integrations/supplier-reply-store";
import { createAvailabilityAlertsFromReply } from "@/lib/integrations/supplier-availability-store";
import { notifyAdminsOfAvailabilityAlerts } from "@/lib/integrations/supplier-availability-alert";
import { notifyIntegration } from "@/lib/integrations";

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as {
      po_number?: string | null;
      supplier_id?: string | null;
      from_address?: string;
      subject?: string;
      body?: string;
      received_at?: string;
      awb_numbers?: string[];
      line_updates?: Array<{
        fabric_number: string;
        status: "confirmed" | "temp_unavailable" | "permanently_unavailable" | "substituted";
        restock_date?: string | null;
        substitute_fabric_number?: string | null;
        note?: string | null;
      }>;
    };

    if (!body.from_address?.trim() || !body.subject?.trim()) {
      return NextResponse.json({ error: "from_address and subject are required." }, { status: 400 });
    }

    await Promise.all([
      ensureFabricOrdersLoaded(),
      ensureShipmentsLoaded(),
      ensureSupplierRepliesLoaded(),
    ]);

    const awb_numbers = [...new Set((body.awb_numbers ?? []).map((value) => value.trim()).filter(Boolean))];
    const matchedOrder =
      body.po_number?.trim()
        ? listStoredFabricOrders().find(
            (order) => order.po_number.toUpperCase() === body.po_number!.trim().toUpperCase()
          )
        : undefined;

    const record = logSupplierReply({
      po_number: body.po_number?.trim() ?? matchedOrder?.po_number ?? null,
      supplier_id: body.supplier_id?.trim() ?? matchedOrder?.supplier_id ?? null,
      from_address: body.from_address.trim(),
      subject: body.subject.trim(),
      body: body.body?.trim() ?? "",
      received_at: body.received_at ?? new Date().toISOString(),
      awb_numbers,
      purchase_order_id: matchedOrder?.id ?? null,
      line_updates: body.line_updates,
    });

    let shipments_created = 0;
    for (const awb_number of awb_numbers) {
      if (getShipmentByAwb(awb_number)) continue;
      const { created } = await createInboundShipmentFromAwb({
        awb_number,
        purchase_order_id: matchedOrder?.id ?? null,
        po_number: record.po_number,
        supplier_id: record.supplier_id,
      });
      if (created) shipments_created += 1;
    }

    const alerts =
      body.line_updates && body.line_updates.length > 0
        ? createAvailabilityAlertsFromReply({
            reply_id: record.id,
            po_number: record.po_number,
            purchase_order_id: record.purchase_order_id ?? null,
            supplier_id: record.supplier_id,
            email_subject: record.subject,
            line_updates: body.line_updates,
          })
        : [];

    if (alerts.length > 0) {
      void notifyAdminsOfAvailabilityAlerts(alerts);
    }

    await notifyIntegration("supplier.reply_logged", {
      id: record.id,
      po_number: record.po_number,
      supplier_id: record.supplier_id,
      from_address: record.from_address,
      subject: record.subject,
      line_update_count: record.line_updates?.length ?? 0,
    }, "zapier");

    if (alerts.length > 0) {
      await notifyIntegration(
        "supplier.availability_detected",
        {
          reply_id: record.id,
          po_number: record.po_number,
          supplier_id: record.supplier_id,
          alert_count: alerts.length,
          fabrics: alerts.map((alert) => alert.fabric_number),
        },
        "zapier"
      );
    }

    return NextResponse.json({ ok: true, reply: record, alerts, shipments_created }, { status: 201 });
  } catch (error) {
    console.error("Supplier reply ingest failed:", error);
    return NextResponse.json({ error: "Failed to log supplier reply." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  await ensureSupplierRepliesLoaded();
  const { listSupplierReplies } = await import("@/lib/integrations/supplier-reply-store");
  return NextResponse.json({ replies: listSupplierReplies() });
}
