import fs from "fs";
import path from "path";
import {
  ERP_DOCUMENT_CATEGORIES,
  ERP_DOCUMENT_DEFINITIONS,
  recordSummaryForKey,
  updatedAtFromData,
} from "@/lib/data/erp-document-catalog";
import { ERP_DOCUMENT_SPECS, type ErpDocumentKey } from "@/lib/data/document-keys";
import { isSupabaseDocumentsStorage, loadDocument } from "@/lib/data/document-persistence";
import { localInvoiceFilesDirStats } from "@/lib/data/invoice-file-storage";
import type {
  DocumentsLibrarySnapshot,
  ErpDocumentRow,
  PriceCatalogRow,
  ReferenceSourceFileRow,
} from "@/lib/data/documents-library-shared";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type {
  DocumentsLibrarySnapshot,
  ErpDocumentRow,
  PriceCatalogRow,
  ReferenceSourceFileRow,
  ScannedFileGroup,
} from "@/lib/data/documents-library-shared";
export { formatDataSize } from "@/lib/data/documents-library-shared";

function approximateJsonBytes(data: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(data), "utf8");
  } catch {
    return 0;
  }
}

function folderStats(dir: string): { fileCount: number; totalBytes: number } {
  try {
    if (!fs.existsSync(dir)) return { fileCount: 0, totalBytes: 0 };
    const files = fs.readdirSync(dir).filter((name) => !name.startsWith("."));
    let totalBytes = 0;
    for (const name of files) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isFile()) totalBytes += fs.statSync(full).size;
    }
    return { fileCount: files.length, totalBytes };
  } catch {
    return { fileCount: 0, totalBytes: 0 };
  }
}

async function getSupabaseUpdatedAtMap(): Promise<Map<ErpDocumentKey, string>> {
  const admin = getSupabaseAdmin();
  if (!admin) return new Map();
  const { data } = await admin.from("erp_documents").select("id, updated_at");
  const map = new Map<ErpDocumentKey, string>();
  for (const row of data ?? []) {
    if (row.id && row.updated_at) map.set(row.id as ErpDocumentKey, row.updated_at);
  }
  return map;
}

function loadPriceCatalogs(): PriceCatalogRow[] {
  const dir = path.join(process.cwd(), "src/data/suppliers");
  const rows: PriceCatalogRow[] = [];

  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json") || file === "contacts.json") continue;
    const filePath = path.join(dir, file);
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
        supplier?: { name?: string; code?: string };
        price_list_name?: string;
        source_file?: string;
        fabric_count?: number;
        imported_at?: string;
        fabrics?: unknown[];
      };
      const supplierName = raw.supplier?.name ?? raw.supplier?.code ?? file.replace(/\.json$/, "");
      const fabricCount =
        typeof raw.fabric_count === "number"
          ? raw.fabric_count
          : Array.isArray(raw.fabrics)
            ? raw.fabrics.length
            : 0;
      rows.push({
        id: file.replace(/\.json$/, ""),
        supplierName,
        priceListName: raw.price_list_name ?? file.replace(/\.json$/, ""),
        sourceFile: raw.source_file ?? null,
        fabricCount,
        importedAt: raw.imported_at ?? null,
        filePath: `src/data/suppliers/${file}`,
        appHref: "/fabric-specification",
      });
    } catch {
      // skip invalid catalog files
    }
  }

  return rows.sort((a, b) => a.supplierName.localeCompare(b.supplierName));
}

function loadReferenceSourceFiles(): {
  files: ReferenceSourceFileRow[];
  updatedAt: string | null;
} {
  const manifestPath = path.join(process.cwd(), "src/data/reference-source-files.json");
  if (!fs.existsSync(manifestPath)) {
    return { files: [], updatedAt: null };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      updated_at?: string;
      files?: Array<{
        id: string;
        supplier: string;
        filename: string;
        relative_path: string;
        type: string;
        catalog_id?: string | null;
        import_status: string;
        notes?: string;
      }>;
    };

    const files = (raw.files ?? []).map((entry) => {
      const fullPath = path.join(process.cwd(), entry.relative_path);
      const existsOnDisk = fs.existsSync(fullPath);
      const fileBytes = existsOnDisk ? fs.statSync(fullPath).size : 0;
      return {
        id: entry.id,
        supplier: entry.supplier,
        filename: entry.filename,
        relativePath: entry.relative_path,
        type: entry.type,
        catalogId: entry.catalog_id ?? null,
        importStatus: entry.import_status,
        notes: entry.notes ?? null,
        fileBytes,
        existsOnDisk,
        downloadHref: `/api/reference-documents/${entry.id}`,
      };
    });

    files.sort((a, b) => {
      const supplier = a.supplier.localeCompare(b.supplier);
      if (supplier !== 0) return supplier;
      return a.filename.localeCompare(b.filename);
    });

    return { files, updatedAt: raw.updated_at ?? null };
  } catch {
    return { files: [], updatedAt: null };
  }
}

export async function getDocumentsLibrarySnapshot(): Promise<DocumentsLibrarySnapshot> {
  const supabaseUpdatedAt = await getSupabaseUpdatedAtMap();
  const erpRows: ErpDocumentRow[] = [];

  for (const def of ERP_DOCUMENT_DEFINITIONS) {
    const spec = ERP_DOCUMENT_SPECS[def.key];
    const data = await loadDocument(spec.path, spec.fallback);
    erpRows.push({
      ...def,
      recordSummary: recordSummaryForKey(def.key, data),
      updatedAt: updatedAtFromData(data),
      supabaseUpdatedAt: supabaseUpdatedAt.get(def.key) ?? null,
      approximateBytes: approximateJsonBytes(data),
    });
  }

  const categories = ERP_DOCUMENT_CATEGORIES.map((category) => ({
    ...category,
    documents: erpRows.filter((row) => row.category === category.id),
  }));

  const supplierPdfStats = isSupabaseDocumentsStorage()
    ? { fileCount: 0, totalBytes: 0 }
    : localInvoiceFilesDirStats("supplier");
  const transporterPdfStats = isSupabaseDocumentsStorage()
    ? { fileCount: 0, totalBytes: 0 }
    : localInvoiceFilesDirStats("transporter");
  const referenceSource = loadReferenceSourceFiles();

  return {
    storageMode: isSupabaseDocumentsStorage() ? "supabase" : "local",
    erpDocumentCount: erpRows.length,
    totalErpBytes: erpRows.reduce((sum, row) => sum + row.approximateBytes, 0),
    categories,
    priceCatalogs: loadPriceCatalogs(),
    scannedFiles: [
      {
        id: "supplier_pdfs",
        label: "Supplier invoice PDFs",
        description: "Fabric supplier invoices saved from inbox scan",
        fileCount: supplierPdfStats.fileCount,
        totalBytes: supplierPdfStats.totalBytes,
        appHref: "/supplier-invoices",
        folderPath: "supplier-invoices/files/",
      },
      {
        id: "transporter_pdfs",
        label: "Transporter & customs PDFs",
        description: "DHL, customs duty, and freight documents",
        fileCount: transporterPdfStats.fileCount,
        totalBytes: transporterPdfStats.totalBytes,
        appHref: "/supplier-invoices",
        folderPath: "supplier-invoices/transporter-files/",
      },
    ],
    referenceSourceFiles: referenceSource.files,
    referenceSourceUpdatedAt: referenceSource.updatedAt,
  };
}

