import { getImapConfig } from "@/lib/email/imap-config";
import { getInboxScanEmail } from "@/lib/email/imap-auth";
import { processInboundSupplierEmail, type ProcessedInboundEmail } from "@/lib/email/inbound/process-supplier-email";
import {
  getSupplierInboxSearchDomains,
  isKnownSupplierSender,
} from "@/lib/email/inbound/supplier-email-match";
import { processTransporterEmail } from "@/lib/email/inbound/process-transporter-email";
import { isRelevantTransporterEmail, isTrustedTransporterSource } from "@/lib/email/inbound/parse-transporter-email";
import { extractPoNumbers } from "@/lib/email/inbound/parse-supplier-email";
import { listStoredFabricOrders } from "@/lib/integrations/fabric-order-store";
import { normalizeEmailList, readSupplierContactsSync } from "@/lib/data/supplier-contacts";
import {
  looksLikeSupplierInvoiceSubject,
  resolveInboxScanOptions,
  type InboxScanOptions,
} from "@/lib/email/inbound/scan-inbox-config";

export type InboxScanResult = {
  scanned: number;
  processed: number;
  skipped: number;
  shipments_created: number;
  invoices_saved: number;
  availability_alerts_created: number;
  transporter_invoices_saved: number;
  scan_days: number;
  scan_limit: number;
  results: ProcessedInboundEmail[];
};

function normalizeAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
}

function isRelevantSupplierEmail(fromAddress: string, subject: string, body: string): boolean {
  if (isKnownSupplierSender(fromAddress)) return true;

  const sentPoNumbers = new Set(listStoredFabricOrders().map((order) => order.po_number.toUpperCase()));
  const mentioned = extractPoNumbers(`${subject}\n${body}`);
  if (mentioned.some((po) => sentPoNumbers.has(po))) return true;

  return looksLikeSupplierInvoiceSubject(subject, false);
}

function getSupplierFromAddresses(): string[] {
  const addresses = new Set<string>();
  for (const supplier of readSupplierContactsSync().suppliers) {
    for (const email of normalizeEmailList(supplier.emails, supplier.email)) {
      addresses.add(email.toLowerCase());
    }
  }
  return [...addresses];
}

async function collectScanUids(
  client: import("imapflow").ImapFlow,
  since: Date,
  generalLimit: number
): Promise<number[]> {
  const uidSet = new Set<number>();

  const allInWindow = await client.search({ since }, { uid: true });
  for (const uid of allInWindow.slice(-generalLimit)) {
    uidSet.add(uid);
  }

  for (const fromAddress of getSupplierFromAddresses()) {
    try {
      const supplierUids = await client.search({ since, from: fromAddress }, { uid: true });
      for (const uid of supplierUids) {
        uidSet.add(uid);
      }
    } catch {
      // Some IMAP servers reject certain from searches; keep the general scan.
    }
  }

  for (const domain of getSupplierInboxSearchDomains()) {
    try {
      const domainUids = await client.search({ since, from: domain }, { uid: true });
      for (const uid of domainUids) {
        uidSet.add(uid);
      }
    } catch {
      // Domain-wide from search may be unsupported on some providers.
    }
  }

  return [...uidSet].sort((a, b) => b - a);
}

export async function scanSupplierInbox(options: InboxScanOptions = {}): Promise<InboxScanResult> {
  const { days, limit } = resolveInboxScanOptions(options);
  const config = getImapConfig();
  if (!config) {
    const mailbox = getInboxScanEmail();
    throw new Error(
      mailbox
        ? `Inbox scan is not configured. Save a Google App Password for ${mailbox} on Supplier Inbox.`
        : "Inbox scan is not configured. Set an inbox to scan under Purchasing → Suppliers."
    );
  }

  let ImapFlow: typeof import("imapflow").ImapFlow;
  let simpleParser: typeof import("mailparser").simpleParser;

  try {
    ({ ImapFlow } = await import("imapflow"));
    ({ simpleParser } = await import("mailparser"));
  } catch {
    throw new Error("Inbox scanning packages are missing. Run: npm install");
  }

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    logger: false,
  });

  const results: ProcessedInboundEmail[] = [];
  let scanned = 0;
  let processed = 0;
  let skipped = 0;
  let shipments_created = 0;
  let invoices_saved = 0;
  let availability_alerts_created = 0;
  let transporter_invoices_saved = 0;

  await client.connect().catch((error: unknown) => {
    const response =
      error && typeof error === "object" && "response" in error
        ? String((error as { response?: string }).response ?? "")
        : "";
    if (response.includes("Application-specific password required")) {
      throw new Error(
        "Gmail requires a Google App Password (not your normal password). Create one at https://myaccount.google.com/apppasswords, paste it on Supplier Inbox, and scan again."
      );
    }
    const message = error instanceof Error ? error.message : "Failed to connect to inbox.";
    throw new Error(message);
  });

  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const uids = await collectScanUids(client, since, limit);
      const recentUids = uids;

      for (const uid of recentUids) {
        scanned += 1;

        const message = await client.fetchOne(String(uid), { source: true, envelope: true }, { uid: true });
        if (!message?.source) continue;

        const parsed = await simpleParser(message.source);
        const fromAddress = parsed.from?.value?.[0]?.address ?? message.envelope?.from?.[0]?.address ?? "";
        const subject = parsed.subject ?? message.envelope?.subject ?? "";
        const body = parsed.text ?? parsed.html?.replace(/<[^>]+>/g, " ") ?? "";
        const messageId = parsed.messageId ?? `uid-${uid}`;
        const receivedAt = (parsed.date ?? new Date()).toISOString();
        const attachment_names = (parsed.attachments ?? [])
          .map((attachment) => attachment.filename)
          .filter((name): name is string => Boolean(name));
        const attachments = (parsed.attachments ?? [])
          .filter((attachment) => attachment.content && attachment.filename)
          .map((attachment) => ({
            filename: attachment.filename as string,
            content: attachment.content as Buffer,
            contentType: attachment.contentType ?? null,
          }));

        if (!fromAddress || normalizeAddress(fromAddress) === normalizeAddress(config.user)) {
          continue;
        }

        const hasPdfInvoice = attachments.some((attachment) => /\.pdf$/i.test(attachment.filename));
        const looksLikeInvoice = looksLikeSupplierInvoiceSubject(subject, hasPdfInvoice);

        const fromIsSupplier = isKnownSupplierSender(fromAddress);
        const isSupplier =
          isRelevantSupplierEmail(fromAddress, subject, body) ||
          (fromIsSupplier && hasPdfInvoice) ||
          (hasPdfInvoice && looksLikeInvoice);

        const isTransporter =
          isRelevantTransporterEmail(fromAddress, subject, body, hasPdfInvoice) &&
          !(fromIsSupplier && looksLikeInvoice && !isTrustedTransporterSource(fromAddress, subject));

        if (!isTransporter && !isSupplier) {
          continue;
        }

        if (isTransporter) {
          const transporterResult = await processTransporterEmail({
            message_id: messageId,
            from_address: fromAddress,
            subject,
            body,
            received_at: receivedAt,
            attachments,
          });
          if (!transporterResult.skipped) {
            transporter_invoices_saved += transporterResult.transporter_invoices_saved;
          }
        }

        if (!isSupplier) {
          continue;
        }

        const result = await processInboundSupplierEmail({
          message_id: messageId,
          from_address: fromAddress,
          subject,
          body,
          received_at: receivedAt,
          attachment_names,
          attachments,
        });

        results.push(result);
        if (result.skipped) {
          skipped += 1;
        } else {
          processed += 1;
          shipments_created += result.shipments_created;
          invoices_saved += result.invoices_saved;
          availability_alerts_created += result.availability_alerts_created;
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  return {
    scanned,
    processed,
    skipped,
    shipments_created,
    invoices_saved,
    availability_alerts_created,
    transporter_invoices_saved,
    scan_days: days,
    scan_limit: limit,
    results,
  };
}
