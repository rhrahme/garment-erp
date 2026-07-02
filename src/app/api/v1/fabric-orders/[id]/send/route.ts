import { NextResponse } from "next/server";
import { getFactoryOrdersEmail } from "@/lib/data/supplier-catalogs";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import {
  ensureFabricOrdersLoaded,
  getStoredFabricOrder,
  markStoredFabricOrderLinesSent,
  markStoredFabricOrderSent,
} from "@/lib/integrations/fabric-order-store";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { notifyIntegration } from "@/lib/integrations";
import { buildFabricOrderEmail } from "@/lib/fabric-sourcing/email";
import { getPriceListItems } from "@/lib/data/queries";
import { sendEmail } from "@/lib/email/smtp";
import { getSalesOrderById } from "@/lib/data/sales-orders";
import { clientCodeFromReference } from "@/lib/sales-orders/label-codes";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    const { id } = await params;
    const requestBody = (await request.json().catch(() => ({}))) as { line_ids?: string[] };
    await Promise.all([ensureFabricOrdersLoaded(), ensureDocumentsLoaded(["sales_orders"])]);
    const order = getStoredFabricOrder(id);
    if (!order || !order.supplier) {
      return NextResponse.json({ error: "Fabric order not found." }, { status: 404 });
    }

    const lineIds = (requestBody.line_ids ?? []).filter(Boolean);
    const orderLines = order.lines ?? [];
    const linesToSend =
      lineIds.length > 0
        ? orderLines.filter((line) => lineIds.includes(line.id))
        : orderLines;

    if (linesToSend.length === 0) {
      return NextResponse.json({ error: "At least one fabric line is required." }, { status: 400 });
    }

    const fabrics = await getPriceListItems(order.supplier_id);
    const salesOrder = order.sales_order_id ? getSalesOrderById(order.sales_order_id) : undefined;
    const clientCode =
      salesOrder?.client_code ??
      (order.client_reference ? clientCodeFromReference(order.client_reference) : "—");

    const email = buildFabricOrderEmail({
      supplierName: order.supplier.name,
      supplierEmail: order.supplier.email ?? "",
      supplierEmails: order.supplier.emails,
      fromEmail: await getFactoryOrdersEmail(),
      clientCode,
      poNumber: order.po_number,
      deliveryDestination: salesOrder?.delivery_destination ?? null,
      lines: linesToSend.map((line) => {
        const fabric = fabrics.find((f) => f.fabric_number === line.fabric_number);
        return {
          fabricNumber: line.fabric_number ?? "—",
          quantity: line.quantity_ordered,
          unit: fabric?.unit ?? "meters",
          labelCount: line.label_count ?? line.label_stickers?.length ?? 1,
          labelStickers: line.label_stickers ?? undefined,
        };
      }),
    });

    const recipients = email.to.split(",").map((value) => value.trim()).filter(Boolean);
    const result = await sendEmail({
      to: recipients,
      subject: email.subject,
      text: email.body,
      from: email.from,
      replyTo: email.from,
    });

    const emailedAt = new Date().toISOString();
    const emailTo = recipients.join(", ");
    const updated =
      lineIds.length > 0
        ? (
            await markStoredFabricOrderLinesSent({ [id]: lineIds }, {
              emailed_at: emailedAt,
              email_to: emailTo,
            })
          )[0]
        : await markStoredFabricOrderSent(id, {
            emailed_at: emailedAt,
            email_to: emailTo,
          });

    await notifyIntegration("fabric_order.sent", {
      id: order.id,
      po_number: order.po_number,
      supplier_id: order.supplier_id,
      supplier_name: order.supplier.name,
      email_to: emailTo,
      emailed_at: emailedAt,
      message_id: result.messageId,
      line_ids: lineIds.length > 0 ? lineIds : null,
      lines_sent: linesToSend.length,
      partial: lineIds.length > 0 && lineIds.length < orderLines.length,
    });

    return NextResponse.json({
      ok: true,
      order: updated,
      email: {
        to: recipients,
        subject: email.subject,
        message_id: result.messageId,
      },
    });
  } catch (error) {
    console.error("Send fabric order failed:", error);
    const message = error instanceof Error ? error.message : "Failed to send fabric order.";
    await notifyIntegration("fabric_order.email_failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
