import { NextResponse } from "next/server";
import { scanSupplierInbox } from "@/lib/email/inbound/scan-inbox";
import {
  INBOX_SCAN_DAYS_DEFAULT,
  INBOX_SCAN_LIMIT_DEFAULT,
} from "@/lib/email/inbound/scan-inbox-config";
import { ensureDocumentsLoaded, flushErpDocumentsToSupabase } from "@/lib/data/document-persistence";
import { getInboxScanEmail, saveImapPassword } from "@/lib/email/imap-auth";
import { isImapConfigured } from "@/lib/email/imap-config";
import { getFactoryOrdersEmail } from "@/lib/data/supplier-catalogs";
import { readSupplierContactsSync } from "@/lib/data/supplier-contacts";

function resolveScanMailbox(): string | null {
  return getInboxScanEmail() ?? readSupplierContactsSync().inbox_scan_email;
}

function inboxNotConfiguredMessage(): string {
  const mailbox = resolveScanMailbox();
  if (!mailbox) {
    return "Inbox scan is not configured. Set an inbox to scan under Purchasing → Suppliers, then save a Google App Password on Supplier Inbox (or set IMAP_USER and IMAP_PASS in .env.local).";
  }
  return `Inbox scan is not configured. Save a Google App Password for ${mailbox} on Supplier Inbox (or set IMAP_PASS in .env.local).`;
}

const SCAN_INBOX_DOCUMENT_KEYS = [
  "supplier_contacts",
  "fabric_orders",
  "shipments",
  "supplier_replies",
  "processed_emails",
  "supplier_invoices",
  "transporter_invoices",
  "supplier_availability_alerts",
] as const;

/** IMAP scan + PDF uploads can run several minutes on production. */
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    await ensureDocumentsLoaded(SCAN_INBOX_DOCUMENT_KEYS);
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
    await flushErpDocumentsToSupabase(SCAN_INBOX_DOCUMENT_KEYS);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to scan inbox.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  await ensureDocumentsLoaded(["supplier_contacts"]);
  return NextResponse.json({
    configured: isImapConfigured(),
    scan_mailbox: resolveScanMailbox(),
    send_mailbox: (await getFactoryOrdersEmail()) ?? process.env.SMTP_USER?.trim() ?? "orders.ruh@hagan.pro",
    scan_days_default: INBOX_SCAN_DAYS_DEFAULT,
    scan_limit_default: INBOX_SCAN_LIMIT_DEFAULT,
  });
}
