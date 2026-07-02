import { NextResponse } from "next/server";
import { getFactoryOrdersEmail } from "@/lib/data/supplier-catalogs";
import { isValidEmail, normalizeEmail } from "@/lib/data/supplier-contacts";
import { parseRecipientList, sendEmail } from "@/lib/email/smtp";
import { resolveSupplierCc } from "@/lib/fabric-sourcing/email-content";
import { notifyIntegration } from "@/lib/integrations";
import {
  ensureFabricOrdersLoaded,
  markStoredFabricOrderLinesSent,
  markStoredFabricOrdersSent,
} from "@/lib/integrations/fabric-order-store";
import type { FabricOrderEmail } from "@/lib/types/fabric-sourcing";

function isValidAddress(value: string): boolean {
  return isValidEmail(value);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<FabricOrderEmail> & {
      poNumber?: string;
      poNumbers?: string[];
      ids?: string[];
      /** When set, only these PO line ids are marked sent (partial send). */
      lineIdsByPoId?: Record<string, string[]>;
    };

    const to = parseRecipientList(body.to ?? "");
    const cc = parseRecipientList(resolveSupplierCc(body.cc));
    const subject = body.subject?.trim();
    const text = body.body?.trim();
    const factoryEmail = await getFactoryOrdersEmail();
    const from = normalizeEmail(body.from) ?? normalizeEmail(factoryEmail) ?? undefined;

    if (to.length === 0) {
      return NextResponse.json({ error: "At least one recipient is required." }, { status: 400 });
    }

    if (!subject) {
      return NextResponse.json({ error: "Email subject is required." }, { status: 400 });
    }

    if (!text) {
      return NextResponse.json({ error: "Email body is required." }, { status: 400 });
    }

    for (const address of to) {
      if (!isValidAddress(address)) {
        return NextResponse.json({ error: `Invalid recipient email: ${address}` }, { status: 400 });
      }
    }

    for (const address of cc) {
      if (!isValidAddress(address)) {
        return NextResponse.json({ error: `Invalid CC email: ${address}` }, { status: 400 });
      }
    }

    if (from && !isValidAddress(from)) {
      return NextResponse.json({ error: "Invalid sender email." }, { status: 400 });
    }

    const result = await sendEmail({
      to,
      cc,
      subject,
      text,
      from,
      replyTo: from,
    });

    const emailedAt = new Date().toISOString();
    const emailTo = to.join(", ");
    const poNumbers =
      body.poNumbers?.filter(Boolean) ??
      (body.poNumber ? [body.poNumber] : []);
    const ids = (body.ids ?? []).filter(Boolean);
    const lineIdsByPoId = body.lineIdsByPoId ?? {};
    const hasLineSelection = Object.values(lineIdsByPoId).some((lineIds) => lineIds.length > 0);

    let markedOrders: Awaited<ReturnType<typeof markStoredFabricOrdersSent>> = [];
    if (hasLineSelection) {
      await ensureFabricOrdersLoaded();
      markedOrders = await markStoredFabricOrderLinesSent(lineIdsByPoId, {
        emailed_at: emailedAt,
        email_to: emailTo,
        status: "sent",
      });
      if (markedOrders.length === 0) {
        return NextResponse.json(
          {
            error:
              "Email was sent but fabric order lines could not be marked as sent. Refresh and use “Already sent”, or contact support.",
          },
          { status: 500 }
        );
      }
    } else if (ids.length > 0) {
      await ensureFabricOrdersLoaded();
      markedOrders = await markStoredFabricOrdersSent(ids, {
        emailed_at: emailedAt,
        email_to: emailTo,
        status: "sent",
      });
      if (markedOrders.length === 0) {
        return NextResponse.json(
          {
            error:
              "Email was sent but fabric orders could not be marked as sent. Refresh and use “Already sent”, or contact support.",
          },
          { status: 500 }
        );
      }
    }

    const notifyPayload = markedOrders.length > 0
      ? markedOrders.flatMap((order) => {
          const selectedLineIds = lineIdsByPoId[order.id];
          const lineCount = selectedLineIds?.length ?? order.lines?.length ?? 0;
          return notifyIntegration("fabric_order.sent", {
            id: order.id,
            po_number: order.po_number,
            supplier_id: order.supplier_id,
            supplier_name: order.supplier?.name ?? null,
            email_to: emailTo,
            emailed_at: emailedAt,
            message_id: result.messageId,
            batch_size: markedOrders.length,
            line_ids: selectedLineIds ?? null,
            lines_sent: lineCount,
            partial: selectedLineIds ? selectedLineIds.length < (order.lines?.length ?? 0) : false,
          });
        })
      : [
          notifyIntegration("fabric_order.sent", {
            po_number: poNumbers[0] ?? body.poNumber ?? null,
            po_numbers: poNumbers.length > 0 ? poNumbers : null,
            email_to: emailTo,
            emailed_at: emailedAt,
            message_id: result.messageId,
            batch_size: poNumbers.length > 1 ? poNumbers.length : undefined,
          }),
        ];

    await Promise.all(notifyPayload);

    return NextResponse.json({
      ok: true,
      message: `Email sent to ${result.accepted.join(", ")}`,
      messageId: result.messageId,
      accepted: result.accepted,
      rejected: result.rejected,
      emailedAt,
      emailTo,
      emailFrom: from ?? null,
      poNumber: poNumbers[0] ?? body.poNumber ?? null,
      poNumbers,
      markedSent: markedOrders.length > 0,
      markedCount: markedOrders.length,
    });
  } catch (error) {
    console.error("Failed to send fabric order email:", error);
    const message = error instanceof Error ? error.message : "Failed to send email.";
    await notifyIntegration("fabric_order.email_failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
