import { NextResponse } from "next/server";
import { getFactoryOrdersEmail } from "@/lib/data/supplier-catalogs";
import { isValidEmail, normalizeEmail } from "@/lib/data/supplier-contacts";
import { parseRecipientList, sendEmail } from "@/lib/email/smtp";
import { resolveSupplierCc } from "@/lib/fabric-sourcing/email-content";
import { notifyIntegration } from "@/lib/integrations";
import type { FabricOrderEmail } from "@/lib/types/fabric-sourcing";

function isValidAddress(value: string): boolean {
  return isValidEmail(value);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<FabricOrderEmail> & {
      poNumber?: string;
    };

    const to = parseRecipientList(body.to ?? "");
    const cc = parseRecipientList(resolveSupplierCc(body.cc));
    const subject = body.subject?.trim();
    const text = body.body?.trim();
    const factoryEmail = getFactoryOrdersEmail();
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
    await notifyIntegration("fabric_order.sent", {
      po_number: body.poNumber ?? null,
      email_to: to.join(", "),
      emailed_at: emailedAt,
      message_id: result.messageId,
    });

    return NextResponse.json({
      ok: true,
      message: `Email sent to ${result.accepted.join(", ")}`,
      messageId: result.messageId,
      accepted: result.accepted,
      rejected: result.rejected,
      emailedAt,
      emailTo: to.join(", "),
      emailFrom: from ?? null,
      poNumber: body.poNumber ?? null,
    });
  } catch (error) {
    console.error("Failed to send fabric order email:", error);
    const message = error instanceof Error ? error.message : "Failed to send email.";
    await notifyIntegration("fabric_order.email_failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
