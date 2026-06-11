import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { scanSupplierInbox } from "@/lib/email/inbound/scan-inbox";
import {
  INBOX_SCAN_DAYS_DEFAULT,
  INBOX_SCAN_LIMIT_DEFAULT,
} from "@/lib/email/inbound/scan-inbox-config";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { getInboxScanEmail } from "@/lib/email/imap-auth";
import { isImapConfigured } from "@/lib/email/imap-config";
import { getFactoryOrdersEmail } from "@/lib/data/supplier-catalogs";

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

function inboxNotConfiguredMessage(): string {
  const mailbox = getInboxScanEmail();
  if (!mailbox) {
    return "Inbox scan is not configured. Set inbox_scan_email under Purchasing → Suppliers and IMAP_USER/IMAP_PASS on Vercel.";
  }
  return `Inbox scan is not configured. Set IMAP_PASS for ${mailbox} in Vercel environment variables.`;
}

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensureDocumentsLoaded(SCAN_INBOX_DOCUMENT_KEYS);
    const body = (await request.json().catch(() => ({}))) as {
      days?: number;
      limit?: number;
    };

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

export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  await ensureDocumentsLoaded(["supplier_contacts"]);
  return NextResponse.json({
    configured: isImapConfigured(),
    scan_mailbox: getInboxScanEmail(),
    send_mailbox: getFactoryOrdersEmail() ?? process.env.SMTP_USER?.trim() ?? "orders.ruh@hagan.pro",
    scan_days_default: INBOX_SCAN_DAYS_DEFAULT,
    scan_limit_default: INBOX_SCAN_LIMIT_DEFAULT,
  });
}
