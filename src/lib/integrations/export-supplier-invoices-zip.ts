import fs from "fs";
import path from "path";
import {
  listSupplierInvoices,
  getSupplierInvoiceFilePath,
  type SupplierInvoiceRecord,
} from "@/lib/integrations/supplier-invoice-store";
import {
  attachTransporterInvoicesToSuppliers,
  listTransporterInvoices,
  getTransporterInvoiceFilePath,
  relinkTransporterInvoicesByAwb,
  type TransporterInvoiceRecord,
} from "@/lib/integrations/transporter-invoice-store";
import { computeCustomsSummary } from "@/lib/integrations/customs-summary";

function sanitizeFolderName(value: string): string {
  return value.replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").slice(0, 80) || "invoice";
}

function supplierFolderName(invoice: SupplierInvoiceRecord): string {
  const supplier = sanitizeFolderName(invoice.supplier_name ?? invoice.supplier_id ?? "supplier");
  const inv = invoice.invoice_number ?? invoice.id;
  const awb = invoice.awb_numbers[0] ? `_AWB-${invoice.awb_numbers[0]}` : "";
  return `${supplier}_${inv}${awb}`;
}

function transporterFileName(doc: TransporterInvoiceRecord): string {
  const carrier = sanitizeFolderName(doc.carrier);
  const type = doc.expense_type;
  const awb = doc.awb_number ? `_AWB-${doc.awb_number}` : "";
  const ext = doc.original_filename?.match(/\.[^.]+$/)?.[0] ?? ".pdf";
  return `transporter_${carrier}_${type}${awb}${ext}`;
}

function escapeCsv(value: string | null | undefined): string {
  const text = value ?? "";
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function buildManifestCsv(
  invoices: Array<SupplierInvoiceRecord & { transporter_invoices: TransporterInvoiceRecord[] }>,
  unlinked: TransporterInvoiceRecord[]
): string {
  const headers = [
    "folder",
    "document_type",
    "supplier",
    "supplier_invoice_number",
    "supplier_amount",
    "supplier_currency",
    "customs_status",
    "customs_amount_due",
    "customs_amount_paid",
    "customs_currency",
    "awb",
    "carrier",
    "expense_type",
    "amount",
    "currency",
    "payment_url",
    "filename",
    "received_date",
    "subject",
  ];

  const rows: string[][] = [headers];

  for (const invoice of invoices) {
    const folder = `invoices/${supplierFolderName(invoice)}`;
    const customs = computeCustomsSummary(invoice.awb_numbers, invoice.transporter_invoices);
    rows.push([
      folder,
      "supplier",
      invoice.supplier_name ?? "",
      invoice.invoice_number ?? "",
      invoice.amount ?? "",
      invoice.currency ?? "",
      customs.status,
      customs.amount_due ?? "",
      customs.amount_paid ?? "",
      customs.currency ?? "",
      invoice.awb_numbers.join("; "),
      "",
      "",
      invoice.amount ?? "",
      invoice.currency ?? "",
      "",
      invoice.original_filename,
      invoice.received_at.slice(0, 10),
      invoice.subject,
    ]);

    for (const doc of invoice.transporter_invoices) {
      rows.push([
        folder,
        "transporter",
        invoice.supplier_name ?? "",
        invoice.invoice_number ?? "",
        invoice.amount ?? "",
        invoice.currency ?? "",
        customs.status,
        customs.amount_due ?? "",
        customs.amount_paid ?? "",
        customs.currency ?? "",
        doc.awb_number ?? invoice.awb_numbers.join("; "),
        doc.carrier,
        doc.expense_type,
        doc.amount ?? "",
        doc.currency ?? "",
        doc.payment_url ?? "",
        doc.original_filename ?? transporterFileName(doc),
        doc.received_at.slice(0, 10),
        doc.subject,
      ]);
    }
  }

  for (const doc of unlinked) {
    rows.push([
      "unlinked",
      "transporter",
      "",
      doc.invoice_number ?? "",
      "",
      "",
      "",
      "",
      "",
      doc.currency ?? "",
      doc.awb_number ?? "",
      doc.carrier,
      doc.expense_type,
      doc.amount ?? "",
      doc.currency ?? "",
      doc.payment_url ?? "",
      doc.original_filename ?? transporterFileName(doc),
      doc.received_at.slice(0, 10),
      doc.subject,
    ]);
  }

  return `${rows.map((row) => row.map(escapeCsv).join(",")).join("\n")}\n`;
}

export function buildSupplierInvoicesExportZip(): Buffer {
  relinkTransporterInvoicesByAwb();

  const invoices = attachTransporterInvoicesToSuppliers(listSupplierInvoices());
  const linkedIds = new Set(
    invoices.flatMap((invoice) => invoice.transporter_invoices.map((doc) => doc.id))
  );
  const unlinked = listTransporterInvoices().filter((doc) => !linkedIds.has(doc.id));

  const entries: ZipEntryInput[] = [
    {
      name: "manifest.csv",
      data: Buffer.from(buildManifestCsv(invoices, unlinked), "utf8"),
    },
    {
      name: "README.txt",
      data: Buffer.from(
        [
          "Garment ERP — Supplier & transporter invoice export",
          "",
          "invoices/ — one folder per supplier invoice",
          "  supplier-invoice.pdf — fabric supplier invoice",
          "  transporter_*.pdf — DHL/customs/freight documents linked by AWB",
          "unlinked/ — transporter documents not yet matched to a supplier invoice",
          "manifest.csv — spreadsheet index for accounting",
          "",
        ].join("\n"),
        "utf8"
      ),
    },
  ];

  for (const invoice of invoices) {
    const folder = `invoices/${supplierFolderName(invoice)}`;
    const supplierPath = getSupplierInvoiceFilePath(invoice);
    if (fs.existsSync(supplierPath)) {
      entries.push({
        name: `${folder}/supplier-invoice_${invoice.original_filename}`,
        data: fs.readFileSync(supplierPath),
      });
    }

    for (const doc of invoice.transporter_invoices) {
      const filePath = getTransporterInvoiceFilePath(doc);
      if (!filePath || !fs.existsSync(filePath)) continue;
      entries.push({
        name: `${folder}/${transporterFileName(doc)}`,
        data: fs.readFileSync(filePath),
      });
    }
  }

  for (const doc of unlinked) {
    const filePath = getTransporterInvoiceFilePath(doc);
    if (!filePath || !fs.existsSync(filePath)) continue;
    entries.push({
      name: `unlinked/${transporterFileName(doc)}`,
      data: fs.readFileSync(filePath),
    });
  }

  return buildZipBuffer(entries);
}

export function buildSingleSupplierInvoiceExportZip(invoiceId: string): Buffer | null {
  relinkTransporterInvoicesByAwb();

  const invoices = attachTransporterInvoicesToSuppliers(listSupplierInvoices());
  const invoice = invoices.find((item) => item.id === invoiceId);
  if (!invoice) return null;

  const entries: ZipEntryInput[] = [
    {
      name: "manifest.csv",
      data: Buffer.from(buildManifestCsv([invoice], []), "utf8"),
    },
  ];

  const folder = supplierFolderName(invoice);
  const supplierPath = getSupplierInvoiceFilePath(invoice);
  if (fs.existsSync(supplierPath)) {
    entries.push({
      name: `${folder}/supplier-invoice_${invoice.original_filename}`,
      data: fs.readFileSync(supplierPath),
    });
  }

  for (const doc of invoice.transporter_invoices) {
    const filePath = getTransporterInvoiceFilePath(doc);
    if (!filePath || !fs.existsSync(filePath)) continue;
    entries.push({
      name: `${folder}/${transporterFileName(doc)}`,
      data: fs.readFileSync(filePath),
    });
  }

  return buildZipBuffer(entries);
}

export function exportZipFilename(prefix = "supplier-invoices"): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${prefix}-${date}.zip`;
}
