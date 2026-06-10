import { NextResponse } from "next/server";
import { getFactoryOrdersEmail, getInboxScanEmailFromContacts } from "@/lib/data/supplier-catalogs";
import { notifyIntegration } from "@/lib/integrations";
import { saveSmtpPassword, sendEmail } from "@/lib/email/smtp";
import { getInboxScanEmail } from "@/lib/email/imap-auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { password?: string; to?: string };
    const password = body.password?.trim();
    const defaultTo = getInboxScanEmail() ?? getInboxScanEmailFromContacts();
    const to = body.to?.trim() || defaultTo;

    if (!to) {
      return NextResponse.json(
        { error: "No scan inbox configured. Set inbox_scan_email under Purchasing → Suppliers first." },
        { status: 400 }
      );
    }

    if (!password) {
      return NextResponse.json({ error: "Enter the email password first." }, { status: 400 });
    }

    try {
      saveSmtpPassword(password);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Could not save password.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const from = getFactoryOrdersEmail() ?? "orders.ruh@hagan.pro";
    const result = await sendEmail({
      to: [to],
      subject: "Garment ERP — test email",
      text: `This is a test email from your Garment ERP.

If you received this, sending from ${from} is working.`,
      from,
      replyTo: from,
    });

    await notifyIntegration("email.test_sent", {
      to,
      from,
      accepted: result.accepted,
    });

    return NextResponse.json({
      ok: true,
      message: `Test email sent to ${to}. Check your inbox.`,
      accepted: result.accepted,
    });
  } catch (error) {
    console.error("Test email failed:", error);
    let message = error instanceof Error ? error.message : "Failed to send test email.";
    if (message.includes("Invalid login") || message.includes("535") || message.includes("BadCredentials")) {
      message =
        "Gmail rejected the login. Use a Google App Password (not your normal password) — create one at " +
        "https://myaccount.google.com/apppasswords (2-Step Verification must be on). " +
        "Set SMTP_USER to your Gmail address in .env.local, save the app password here or in SMTP_PASS, then restart the server.";
    } else if (message.includes("SmtpClientAuthentication is disabled")) {
      message =
        "SMTP authentication is disabled for this mailbox. For Gmail, use an App Password. " +
        "For Microsoft 365, ask your admin to enable Authenticated SMTP.";
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
