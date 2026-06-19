import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import loroPianaCatalog from "@/data/suppliers/loro-piana-ss26.json";
import { readLoroPianaSwatchManifest } from "@/lib/fabric-sourcing/loro-piana-swatches";

export {
  LORO_PIANA_MISSING_SWATCHES_PDF_FILENAME,
  LORO_PIANA_MISSING_SWATCHES_PDF_URL,
} from "@/lib/fabric-sourcing/loro-piana-missing-swatches-pdf-meta";

const BOOK_LABELS: Record<string, { book: string }> = {
  "735023": { book: "Events (735)" },
  "781017": { book: "Proposte Abiti SS26 (781)" },
  "781018": { book: "Proposte Abiti SS26 (781)" },
  "781022": { book: "Proposte Abiti SS26 (781)" },
  "781032": { book: "Proposte Abiti SS26 (781)" },
  S24031: { book: "Graffiti S24 (782)" },
  S24032: { book: "Graffiti S24 (782)" },
  S24007: { book: "Graffiti S24 (782)" },
  S10017: { book: "Zefiro S10 (782)" },
  S10018: { book: "Zefiro S10 (782)" },
  S10019: { book: "Zefiro S10 (782)" },
  S10020: { book: "Zefiro S10 (782)" },
  S14029: { book: "DRESANO 340 GRMS (782)" },
};

const GIACCHE_SKIPPED = [
  "780001", "780004", "780009", "780024", "780031", "780032",
  "780044", "780055", "780056", "780057", "780071",
];

const GRAFFITI_SHIRTS_SKIPPED = [
  "S25006", "S25007", "S25010", "S25011", "S25012", "S25013", "S25014", "S25015",
  "S25017", "S25018", "S25023", "S25024", "S25025", "S25026", "S25027", "S25029",
  "S25030", "S25032",
];

const MISSING_FROM_FOLDER = ["S10017", "S10018", "S10019", "S10020", "S14029", "S24007"];

export type LoroPianaMissingSwatchRow = {
  fabric_number: string;
  book: string;
  reason: "No catalog entry" | "Image missing from folder";
};

type CatalogFabric = {
  fabric_number: string;
  collection?: string | null;
  book_number?: string | null;
};

function catalogBook(fabrics: CatalogFabric[], fabricNumber: string): string | null {
  const entry = fabrics.find((f) => f.fabric_number === fabricNumber);
  if (!entry) return null;
  return `${entry.collection ?? "—"} (${entry.book_number ?? "?"})`;
}

export function compileLoroPianaMissingSwatchRows(): LoroPianaMissingSwatchRow[] {
  const manifest = readLoroPianaSwatchManifest();
  const catalog = (loroPianaCatalog as { fabrics?: CatalogFabric[] }).fabrics ?? [];
  const byFabric = new Map<string, LoroPianaMissingSwatchRow>();

  for (const item of manifest.items.filter((i) => !i.ok)) {
    const label =
      BOOK_LABELS[item.fabric_number]?.book ??
      catalogBook(catalog, item.fabric_number) ??
      "—";
    byFabric.set(item.fabric_number, {
      fabric_number: item.fabric_number,
      book: label,
      reason: "No catalog entry",
    });
  }

  for (const fabricNumber of GIACCHE_SKIPPED) {
    if (byFabric.has(fabricNumber)) continue;
    byFabric.set(fabricNumber, {
      fabric_number: fabricNumber,
      book: "Proposte Giacche SS26 (780)",
      reason: "No catalog entry",
    });
  }

  for (const fabricNumber of GRAFFITI_SHIRTS_SKIPPED) {
    if (byFabric.has(fabricNumber)) continue;
    byFabric.set(fabricNumber, {
      fabric_number: fabricNumber,
      book: "Graffiti Shirts S25 (782)",
      reason: "No catalog entry",
    });
  }

  for (const fabricNumber of MISSING_FROM_FOLDER) {
    if (byFabric.has(fabricNumber)) continue;
    byFabric.set(fabricNumber, {
      fabric_number: fabricNumber,
      book: BOOK_LABELS[fabricNumber]?.book ?? catalogBook(catalog, fabricNumber) ?? "—",
      reason: "Image missing from folder",
    });
  }

  return [...byFabric.values()].sort((a, b) =>
    a.fabric_number.localeCompare(b.fabric_number, undefined, { numeric: true })
  );
}

export function generateLoroPianaMissingSwatchesPdf(): Uint8Array {
  const rows = compileLoroPianaMissingSwatchRows();
  const manifest = readLoroPianaSwatchManifest();
  const importedAt = manifest.imported_at ?? new Date().toISOString();
  const noCatalog = rows.filter((r) => r.reason === "No catalog entry").length;
  const missingImage = rows.filter((r) => r.reason === "Image missing from folder").length;

  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const margin = 36;
  let y = margin;

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Loro Piana / Solbiati — Swatches Not Uploaded", margin, y);
  y += 18;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60);
  doc.text(
    `Import session ${new Date(importedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · ${rows.length} fabrics · ${noCatalog} no catalog · ${missingImage} missing image`,
    margin,
    y
  );
  y += 16;

  doc.setTextColor(0);

  const tableWidth = doc.internal.pageSize.getWidth() - margin * 2;

  autoTable(doc, {
    startY: y,
    head: [["Fabric Number", "Book / Collection", "Reason"]],
    body: rows.map((r) => [r.fabric_number, r.book, r.reason]),
    margin: { left: margin, right: margin },
    tableWidth,
    styles: { fontSize: 7.5, cellPadding: 2.5, overflow: "linebreak" },
    headStyles: { fillColor: [30, 41, 59], fontSize: 8, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: tableWidth * 0.18 },
      1: { cellWidth: tableWidth * 0.52 },
      2: { cellWidth: tableWidth * 0.3 },
    },
    theme: "striped",
  });

  return new Uint8Array(doc.output("arraybuffer"));
}
