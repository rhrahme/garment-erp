import { NextResponse } from "next/server";
import { scanSupplierInbox } from "@/lib/email/inbound/scan-inbox";
import {
  INBOX_SCAN_DAYS_DEFAULT,
  INBOX_SCAN_LIMIT_DEFAULT,
} from "@/lib/email/inbound/scan-inbox-config";
import { getInboxScanEmail, saveImapPassword } from "@/lib/email/imap-auth";
import { isImapConfigured } from "@/lib/email/imap-config";
import { getFactoryOrdersEmail } from "@/lib/data/supplier-catalogs";

function inboxNotConfiguredMessage(): string {
  const mailbox = getInboxScanEmail();
  if (!mailbox) {
    return "Inbox scan is not configured. Set an inbox to scan under Purchasing → Suppliers, then save a Google App Password on Supplier Inbox (or set IMAP_USER and IMAP_PASS in .env.local).";
  }
  return `Inbox scan is not configured. Save a Google App Password for ${mailbox} on Supplier Inbox (or set IMAP_PASS in .env.local).`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      password?: string;
      days?: number;
      limit?: number;
    };
    if (body.password?.trim()) {
      saveImapPassword(body.password.trim());
    }

    if (!isImapConfigured()) {
      return NextResponse.json({ error: inboxNotConfiguredMessage() }, { status: 400 });
    }

    const result = await scanSupplierInbox({ days: body.days, limit: body.limit });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to scan inbox.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    configured: isImapConfigured(),
    scan_mailbox: getInboxScanEmail(),
    send_mailbox: getFactoryOrdersEmail() ?? process.env.SMTP_USER?.trim() ?? "orders.ruh@hagan.pro",
    scan_days_default: INBOX_SCAN_DAYS_DEFAULT,
    scan_limit_default: INBOX_SCAN_LIMIT_DEFAULT,
  });
}
