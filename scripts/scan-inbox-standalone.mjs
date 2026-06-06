/**
 * Standalone inbox scan — supplier + DHL/transporter emails.
 * Usage: node scripts/scan-inbox-standalone.mjs [days]
 */
import fs from "fs";
import path from "path";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const ROOT = process.cwd();

function loadEnvFile(filename) {
  const filePath = path.join(ROOT, filename);
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = value;
  }
}

loadEnvFile(".env.local");

const imapSecretPath = path.join(ROOT, "imap-secret.local.json");
if (!process.env.IMAP_PASS && fs.existsSync(imapSecretPath)) {
  process.env.IMAP_PASS = JSON.parse(fs.readFileSync(imapSecretPath, "utf8")).password;
}

const contacts = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src/data/suppliers/contacts.json"), "utf8")
);
const imapUser = process.env.IMAP_USER?.trim() || contacts.inbox_scan_email?.trim();
const imapPass = process.env.IMAP_PASS?.trim();

if (!imapUser || !imapPass) {
  console.error("IMAP not configured.");
  process.exit(1);
}

const days = Number.parseInt(process.argv[2] ?? "14", 10);
const PROCESSED_PATH = path.join(ROOT, "processed-emails.local.json");
const TRANSPORTER_PATH = path.join(ROOT, "transporter-invoices.local.json");
const SUPPLIER_INV_PATH = path.join(ROOT, "supplier-invoices.local.json");
const TRANSPORTER_FILES = path.join(ROOT, "supplier-invoices", "transporter-files");

const DHL_ADC = "no-reply.adc@dhl.com";
const DHL_RECEIPT = "noreply@dhl.com";
const CARRIER_PATTERNS = [/@(?:[\w.-]+\.)?dhl\.(?:com|de|net)/i, /@fedex\.com/i, /@ups\.com/i];
const TRANSPORTER_SIGNAL =
  /customs?|import duty|clearance|payment due|pay now|duty and tax|advance duty|payment receipt|express payment/i;

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function normalizeAddress(value) {
  const match = String(value).match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
}

function extractAwbs(text) {
  const found = new Set();
  for (const m of text.matchAll(/\b(\d{10,12})\b/g)) found.add(m[1]);
  for (const m of text.matchAll(/\b(\d{3}[-\s]?\d{4}[-\s]?\d{4})\b/g)) {
    found.add(m[1].replace(/[-\s]/g, ""));
  }
  return [...found];
}

function extractAmount(text) {
  const m =
    text.match(/\b(USD|EUR|AED|SAR)\s*([0-9][0-9,]*(?:\.[0-9]{2})?)\b/i) ||
    text.match(/\b([0-9][0-9,]*(?:\.[0-9]{2})?)\s*(USD|EUR|AED|SAR)\b/i);
  if (!m) return { amount: null, currency: null };
  if (/^[A-Z]{3}$/i.test(m[1])) return { currency: m[1].toUpperCase(), amount: m[2]?.replace(/,/g, "") ?? null };
  return { currency: m[2].toUpperCase(), amount: m[1]?.replace(/,/g, "") ?? null };
}

function isCarrier(from) {
  const email = normalizeAddress(from);
  if (email === DHL_ADC || email === DHL_RECEIPT) return true;
  return CARRIER_PATTERNS.some((p) => p.test(email));
}

function isTransporterEmail(from, subject, body, hasPdf) {
  const email = normalizeAddress(from);
  if (email === DHL_ADC) return true;
  if (email === DHL_RECEIPT && /payment receipt/i.test(subject)) return true;
  if (isCarrier(from) && (hasPdf || TRANSPORTER_SIGNAL.test(`${subject}\n${body}`))) return true;
  if (TRANSPORTER_SIGNAL.test(`${subject}\n${body}`) && /dhl|fedex|ups/.test(`${subject}\n${body}`.toLowerCase()) && hasPdf) {
    return true;
  }
  return false;
}

function isProcessed(key) {
  const store = readJson(PROCESSED_PATH, { message_ids: [] });
  return store.message_ids.some((id) => id.toLowerCase() === key.toLowerCase());
}

function markProcessed(key) {
  const store = readJson(PROCESSED_PATH, { message_ids: [] });
  if (!store.message_ids.some((id) => id.toLowerCase() === key.toLowerCase())) {
    store.message_ids.push(key);
    writeJson(PROCESSED_PATH, store);
  }
}

function findSupplierInvoiceByAwb(awb) {
  if (!awb) return null;
  const store = readJson(SUPPLIER_INV_PATH, { invoices: [] });
  return store.invoices.find((inv) => inv.awb_numbers?.includes(awb)) ?? null;
}

function saveTransporterDoc(input) {
  const store = readJson(TRANSPORTER_PATH, { invoices: [] });
  const key = `${(input.message_id ?? "no-msg").toLowerCase()}::${(input.original_filename ?? "no-file").toLowerCase()}`;
  const existing = store.invoices.find(
    (row) =>
      `${(row.message_id ?? "no-msg").toLowerCase()}::${(row.original_filename ?? "no-file").toLowerCase()}` === key
  );
  if (existing) return null;

  const supplierInvoiceId = findSupplierInvoiceByAwb(input.awb_number)?.id ?? null;
  let stored_filename = null;
  let file_size = 0;

  if (input.content?.length) {
    fs.mkdirSync(TRANSPORTER_FILES, { recursive: true });
    stored_filename = `transporter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`;
    fs.writeFileSync(path.join(TRANSPORTER_FILES, stored_filename), input.content);
    file_size = input.content.length;
  }

  const record = {
    id: `ti-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    supplier_invoice_id: supplierInvoiceId,
    carrier: input.carrier,
    awb_number: input.awb_number,
    invoice_number: input.invoice_number ?? null,
    expense_type: input.expense_type,
    amount: input.amount,
    currency: input.currency,
    payment_url: input.payment_url ?? null,
    subject: input.subject,
    from_address: input.from_address,
    received_at: input.received_at,
    message_id: input.message_id,
    original_filename: input.original_filename,
    stored_filename,
    file_size,
    source: "email_scan",
    created_at: new Date().toISOString(),
  };

  store.invoices.unshift(record);
  writeJson(TRANSPORTER_PATH, store);
  return record;
}

function relinkAll() {
  const tStore = readJson(TRANSPORTER_PATH, { invoices: [] });
  const sStore = readJson(SUPPLIER_INV_PATH, { invoices: [] });
  let linked = 0;
  for (const doc of tStore.invoices) {
    if (doc.supplier_invoice_id) continue;
    const awb = doc.awb_number;
    if (!awb) continue;
    const match = sStore.invoices.find((inv) => inv.awb_numbers?.includes(awb));
    if (match) {
      doc.supplier_invoice_id = match.id;
      linked += 1;
    }
  }
  writeJson(TRANSPORTER_PATH, tStore);
  return linked;
}

function detectCarrier(from) {
  const email = normalizeAddress(from);
  if (/dhl/.test(email)) return "DHL";
  if (/fedex/.test(email)) return "FedEx";
  if (/ups/.test(email)) return "UPS";
  return "Carrier";
}

async function main() {
  const client = new ImapFlow({
    host: process.env.IMAP_HOST?.trim() || "imap.gmail.com",
    port: Number(process.env.IMAP_PORT ?? 993),
    secure: process.env.IMAP_SECURE !== "false",
    auth: { user: imapUser, pass: imapPass },
    logger: false,
  });

  await client.connect();
  const since = new Date();
  since.setDate(since.getDate() - days);

  let scanned = 0;
  let saved = 0;
  const savedRecords = [];

  const lock = await client.getMailboxLock("INBOX");
  try {
    let uids = [];
    for (const from of [DHL_ADC, DHL_RECEIPT, "dhl.com", "fedex.com"]) {
      try {
        const found = await client.search({ since, from }, { uid: true });
        uids.push(...found);
      } catch {
        // ignore
      }
    }
    const general = await client.search({ since }, { uid: true });
    uids.push(...general.slice(-200));
    uids = [...new Set(uids)].sort((a, b) => b - a);

    for (const uid of uids) {
      scanned += 1;
      const message = await client.fetchOne(String(uid), { source: true, envelope: true }, { uid: true });
      if (!message?.source) continue;

      const parsed = await simpleParser(message.source);
      const fromAddress = parsed.from?.value?.[0]?.address ?? message.envelope?.from?.[0]?.address ?? "";
      const subject = parsed.subject ?? "";
      const body = parsed.text ?? parsed.html?.replace(/<[^>]+>/g, " ") ?? "";
      const messageId = parsed.messageId ?? `uid-${uid}`;
      const receivedAt = (parsed.date ?? new Date()).toISOString();

      if (!fromAddress || normalizeAddress(fromAddress) === normalizeAddress(imapUser)) continue;

      const attachments = (parsed.attachments ?? [])
        .filter((a) => a.content && a.filename)
        .map((a) => ({ filename: a.filename, content: a.content }));

      const hasPdf = attachments.some((a) => /\.pdf$/i.test(a.filename));
      if (!isTransporterEmail(fromAddress, subject, body, hasPdf)) continue;

      const processedKey = `transporter:${messageId}`;
      const awbs = extractAwbs(`${subject}\n${body}`);
      const { amount, currency } = extractAmount(`${subject}\n${body}`);
      const paymentUrl = body.match(/https?:\/\/[^\s"'<>]*dhl[^\s"'<>]*/i)?.[0] ?? null;
      const carrier = detectCarrier(fromAddress);
      const isReceipt = normalizeAddress(fromAddress) === DHL_RECEIPT && /payment receipt/i.test(subject);

      let anySaved = false;
      for (const attachment of attachments.filter((a) => /\.pdf$/i.test(a.filename))) {
        const record = saveTransporterDoc({
          carrier,
          awb_number: awbs[0] ?? null,
          expense_type: "customs",
          amount,
          currency,
          payment_url: paymentUrl,
          subject,
          from_address: fromAddress,
          received_at: receivedAt,
          message_id: messageId,
          original_filename: attachment.filename,
          content: attachment.content,
        });
        if (record) {
          saved += 1;
          anySaved = true;
          savedRecords.push(record);
        }
      }

      if (!anySaved && (paymentUrl || (isReceipt && (amount || awbs[0])))) {
        const record = saveTransporterDoc({
          carrier,
          awb_number: awbs[0] ?? null,
          expense_type: "customs",
          amount,
          currency,
          payment_url: paymentUrl,
          subject,
          from_address: fromAddress,
          received_at: receivedAt,
          message_id: messageId,
          original_filename: null,
          content: null,
        });
        if (record) {
          saved += 1;
          anySaved = true;
          savedRecords.push(record);
        }
      }

      if (anySaved || !isProcessed(processedKey)) {
        markProcessed(processedKey);
      }
    }
  } finally {
    lock.release();
    await client.logout();
  }

  const relinked = relinkAll();

  console.log(
    JSON.stringify(
      {
        mailbox: imapUser,
        scan_days: days,
        scanned,
        transporter_invoices_saved: saved,
        relinked_to_supplier_invoices: relinked,
        new_records: savedRecords.map((r) => ({
          carrier: r.carrier,
          awb: r.awb_number,
          amount: r.amount && r.currency ? `${r.currency} ${r.amount}` : null,
          linked_supplier_invoice: r.supplier_invoice_id,
          subject: r.subject,
        })),
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
