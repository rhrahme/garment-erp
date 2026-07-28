import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import loroPianaCatalog from "@/data/suppliers/loro-piana-ss26.json";
import { readLoroPianaSwatchManifest } from "@/lib/fabric-sourcing/loro-piana-swatches";
import {
  getLoroPianaMillLine,
  type LoroPianaMillLine,
} from "@/lib/fabric-sourcing/loro-piana-styles";

export type LoroPianaBookCoverage = {
  book_number: string;
  collection: string;
  catalog_count: number;
  have_count: number;
  missing_count: number;
  coverage_pct: number;
};

export type SwatchCoverageGroup = LoroPianaBookCoverage & {
  missing_fabric_numbers: string[];
};

export type MillLineSwatchGapReport = {
  mill_line: LoroPianaMillLine;
  label: string;
  total_catalog: number;
  total_have: number;
  total_missing: number;
  zero: SwatchCoverageGroup[];
  partial: SwatchCoverageGroup[];
};

type CatalogFabric = {
  fabric_number: string;
  collection?: string | null;
  book_number?: string | null;
};

export function compileLoroPianaBookCoverage(): LoroPianaBookCoverage[] {
  const manifest = readLoroPianaSwatchManifest();
  const catalog = (loroPianaCatalog as { fabrics?: CatalogFabric[] }).fabrics ?? [];
  const imported = new Set(
    manifest.items.filter((item) => item.ok).map((item) => item.fabric_number)
  );

  const byBook = new Map<
    string,
    { book_number: string; collections: Map<string, number>; catalog_count: number; have_count: number }
  >();

  for (const fabric of catalog) {
    const bookNumber = fabric.book_number?.trim();
    if (!bookNumber) continue;

    if (!byBook.has(bookNumber)) {
      byBook.set(bookNumber, {
        book_number: bookNumber,
        collections: new Map(),
        catalog_count: 0,
        have_count: 0,
      });
    }

    const entry = byBook.get(bookNumber)!;
    entry.catalog_count += 1;
    const collection = fabric.collection?.trim() || "—";
    entry.collections.set(collection, (entry.collections.get(collection) ?? 0) + 1);
    if (imported.has(fabric.fabric_number)) entry.have_count += 1;
  }

  return [...byBook.values()]
    .map((entry) => {
      const collection =
        [...entry.collections.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
      const missing_count = entry.catalog_count - entry.have_count;
      const coverage_pct =
        entry.catalog_count > 0
          ? Math.round((entry.have_count / entry.catalog_count) * 100)
          : 0;

      return {
        book_number: entry.book_number,
        collection,
        catalog_count: entry.catalog_count,
        have_count: entry.have_count,
        missing_count,
        coverage_pct,
      };
    })
    .sort((a, b) =>
      a.book_number.localeCompare(b.book_number, undefined, { numeric: true })
    );
}

export function compileLoroPianaBooksNeedingSwatches(): {
  zero: LoroPianaBookCoverage[];
  partial: LoroPianaBookCoverage[];
} {
  const books = compileLoroPianaBookCoverage();
  return {
    zero: books.filter((book) => book.have_count === 0),
    partial: books.filter((book) => book.have_count > 0 && book.missing_count > 0),
  };
}

function dominantCollection(collections: Map<string, number>): string {
  return [...collections.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
}

function groupKeyForFabric(
  millLine: LoroPianaMillLine,
  fabric: CatalogFabric
): string | null {
  if (millLine === "solbiati") {
    const collection = fabric.collection?.trim();
    return collection || null;
  }
  return fabric.book_number?.trim() || null;
}

export function compileSwatchCoverageByMillLine(
  millLine: LoroPianaMillLine
): MillLineSwatchGapReport {
  const manifest = readLoroPianaSwatchManifest();
  const catalog = (loroPianaCatalog as { fabrics?: CatalogFabric[] }).fabrics ?? [];
  const imported = new Set(
    manifest.items.filter((item) => item.ok).map((item) => item.fabric_number)
  );

  const groups = new Map<
    string,
    {
      book_number: string;
      collections: Map<string, number>;
      catalog_count: number;
      have_count: number;
      missing_fabric_numbers: string[];
    }
  >();

  for (const fabric of catalog) {
    if (getLoroPianaMillLine(fabric.fabric_number) !== millLine) continue;

    const key = groupKeyForFabric(millLine, fabric);
    if (!key) continue;

    if (!groups.has(key)) {
      groups.set(key, {
        book_number: fabric.book_number?.trim() || "—",
        collections: new Map(),
        catalog_count: 0,
        have_count: 0,
        missing_fabric_numbers: [],
      });
    }

    const entry = groups.get(key)!;
    entry.catalog_count += 1;
    const collection = fabric.collection?.trim() || "—";
    entry.collections.set(collection, (entry.collections.get(collection) ?? 0) + 1);
    if (fabric.book_number?.trim() && entry.book_number === "—") {
      entry.book_number = fabric.book_number.trim();
    }
    if (imported.has(fabric.fabric_number)) {
      entry.have_count += 1;
    } else {
      entry.missing_fabric_numbers.push(fabric.fabric_number);
    }
  }

  const allGroups: SwatchCoverageGroup[] = [...groups.entries()]
    .map(([key, entry]) => {
      const collection = millLine === "solbiati" ? key : dominantCollection(entry.collections);
      const missing_count = entry.catalog_count - entry.have_count;
      const coverage_pct =
        entry.catalog_count > 0
          ? Math.round((entry.have_count / entry.catalog_count) * 100)
          : 0;

      return {
        book_number: entry.book_number,
        collection,
        catalog_count: entry.catalog_count,
        have_count: entry.have_count,
        missing_count,
        coverage_pct,
        missing_fabric_numbers: entry.missing_fabric_numbers.sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true })
        ),
      };
    })
    .sort((a, b) => {
      if (millLine === "solbiati") {
        return a.collection.localeCompare(b.collection);
      }
      return a.book_number.localeCompare(b.book_number, undefined, { numeric: true });
    });

  const needing = allGroups.filter((group) => group.missing_count > 0);
  const total_catalog = allGroups.reduce((sum, group) => sum + group.catalog_count, 0);
  const total_have = allGroups.reduce((sum, group) => sum + group.have_count, 0);

  return {
    mill_line: millLine,
    label: millLine === "solbiati" ? "Solbiati" : "Loro Piana",
    total_catalog,
    total_have,
    total_missing: total_catalog - total_have,
    zero: needing.filter((group) => group.have_count === 0),
    partial: needing.filter((group) => group.have_count > 0),
  };
}

export function compileLoroPianaSolbiatiSwatchesMissing(): {
  loro_piana: MillLineSwatchGapReport;
  solbiati: MillLineSwatchGapReport;
} {
  return {
    loro_piana: compileSwatchCoverageByMillLine("loro_piana"),
    solbiati: compileSwatchCoverageByMillLine("solbiati"),
  };
}

function formatGeneratedDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function generateLoroPianaBooksNeedingSwatchesPdf(): Uint8Array {
  const manifest = readLoroPianaSwatchManifest();
  const importedAt = manifest.imported_at ?? new Date().toISOString();
  const { zero, partial } = compileLoroPianaBooksNeedingSwatches();

  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const margin = 42;
  const pageWidth = doc.internal.pageSize.getWidth();
  const tableWidth = pageWidth - margin * 2;
  let y = margin;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Loro Piana books still needing swatch photos", margin, y);
  y += 22;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60);
  doc.text(
    `Generated ${formatGeneratedDate(importedAt)} · ${zero.length} books with no swatches · ${partial.length} partially covered`,
    margin,
    y
  );
  y += 14;

  doc.setFontSize(9);
  doc.text(
    "Note: Desktop Bunches already imported; the books listed below are not covered by that folder.",
    margin,
    y,
    { maxWidth: tableWidth }
  );
  y += 22;
  doc.setTextColor(0);

  const sectionHead = (title: string, subtitle: string) => {
    if (y > doc.internal.pageSize.getHeight() - 120) {
      doc.addPage();
      y = margin;
    }
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(title, margin, y);
    y += 14;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80);
    doc.text(subtitle, margin, y);
    y += 12;
    doc.setTextColor(0);
  };

  sectionHead(
    "Section A — No swatch photos (0%)",
    `${zero.length} catalog book${zero.length === 1 ? "" : "s"} with zero imported swatches`
  );

  autoTable(doc, {
    startY: y,
    head: [["Collection", "Book #", "Catalog", "Missing"]],
    body: zero.map((book) => [
      book.collection,
      book.book_number,
      String(book.catalog_count),
      String(book.missing_count),
    ]),
    margin: { left: margin, right: margin, top: margin, bottom: margin },
    tableWidth,
    styles: { fontSize: 9, cellPadding: 4, overflow: "linebreak", valign: "middle" },
    headStyles: { fillColor: [30, 41, 59], fontSize: 9, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: tableWidth * 0.55 },
      1: { cellWidth: tableWidth * 0.12, halign: "center" },
      2: { cellWidth: tableWidth * 0.16, halign: "right" },
      3: { cellWidth: tableWidth * 0.17, halign: "right" },
    },
    theme: "striped",
  });

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;

  sectionHead(
    "Section B — Partial coverage",
    `${partial.length} catalog book${partial.length === 1 ? "" : "s"} with some swatches but gaps remaining`
  );

  autoTable(doc, {
    startY: y,
    head: [["Collection", "Book #", "Catalog", "Have", "Missing", "%"]],
    body: partial.map((book) => [
      book.collection,
      book.book_number,
      String(book.catalog_count),
      String(book.have_count),
      String(book.missing_count),
      `${book.coverage_pct}%`,
    ]),
    margin: { left: margin, right: margin, top: margin, bottom: margin },
    tableWidth,
    styles: { fontSize: 9, cellPadding: 4, overflow: "linebreak", valign: "middle" },
    headStyles: { fillColor: [30, 41, 59], fontSize: 9, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: tableWidth * 0.4 },
      1: { cellWidth: tableWidth * 0.1, halign: "center" },
      2: { cellWidth: tableWidth * 0.12, halign: "right" },
      3: { cellWidth: tableWidth * 0.12, halign: "right" },
      4: { cellWidth: tableWidth * 0.14, halign: "right" },
      5: { cellWidth: tableWidth * 0.12, halign: "right" },
    },
    theme: "striped",
  });

  return new Uint8Array(doc.output("arraybuffer"));
}

function formatMissingFabricList(codes: string[], maxShown = 999): string {
  if (codes.length === 0) return "—";
  if (codes.length <= maxShown) return codes.join(", ");
  return `${codes.slice(0, maxShown).join(", ")} … +${codes.length - maxShown} more`;
}

type PdfLayout = {
  doc: jsPDF;
  margin: number;
  pageWidth: number;
  tableWidth: number;
  y: number;
};

function ensureSpace(layout: PdfLayout, needed: number) {
  if (layout.y > layout.doc.internal.pageSize.getHeight() - needed) {
    layout.doc.addPage();
    layout.y = layout.margin;
  }
}

function sectionHead(layout: PdfLayout, title: string, subtitle: string) {
  ensureSpace(layout, 120);
  layout.doc.setFontSize(12);
  layout.doc.setFont("helvetica", "bold");
  layout.doc.text(title, layout.margin, layout.y);
  layout.y += 14;
  layout.doc.setFontSize(9);
  layout.doc.setFont("helvetica", "normal");
  layout.doc.setTextColor(80);
  layout.doc.text(subtitle, layout.margin, layout.y);
  layout.y += 12;
  layout.doc.setTextColor(0);
}

function millLinePartHead(layout: PdfLayout, report: MillLineSwatchGapReport) {
  ensureSpace(layout, 80);
  layout.doc.setFontSize(14);
  layout.doc.setFont("helvetica", "bold");
  layout.doc.text(
    report.label + (report.mill_line === "solbiati" ? " (S* fabric codes)" : " (numeric fabric codes)"),
    layout.margin,
    layout.y
  );
  layout.y += 18;
  layout.doc.setFontSize(10);
  layout.doc.setFont("helvetica", "normal");
  layout.doc.setTextColor(60);
  layout.doc.text(
    `${report.total_missing} missing of ${report.total_catalog} catalog fabrics · ${report.zero.length} group${report.zero.length === 1 ? "" : "s"} at 0% · ${report.partial.length} partially covered`,
    layout.margin,
    layout.y
  );
  layout.y += 20;
  layout.doc.setTextColor(0);
}

function renderZeroTable(layout: PdfLayout, groups: SwatchCoverageGroup[]) {
  if (groups.length === 0) {
    layout.doc.setFontSize(9);
    layout.doc.text("None — all groups have at least one swatch.", layout.margin, layout.y);
    layout.y += 16;
    return;
  }

  autoTable(layout.doc, {
    startY: layout.y,
    head: [["Collection", "Book #", "Catalog", "Missing", "Missing fabric #"]],
    body: groups.map((group) => [
      group.collection,
      group.book_number,
      String(group.catalog_count),
      String(group.missing_count),
      formatMissingFabricList(group.missing_fabric_numbers),
    ]),
    margin: { left: layout.margin, right: layout.margin, top: layout.margin, bottom: layout.margin },
    tableWidth: layout.tableWidth,
    styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: [30, 41, 59], fontSize: 8, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: layout.tableWidth * 0.22 },
      1: { cellWidth: layout.tableWidth * 0.08, halign: "center" },
      2: { cellWidth: layout.tableWidth * 0.08, halign: "right" },
      3: { cellWidth: layout.tableWidth * 0.08, halign: "right" },
      4: { cellWidth: layout.tableWidth * 0.54 },
    },
    theme: "striped",
  });

  layout.y = (layout.doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;
}

function renderPartialTable(layout: PdfLayout, groups: SwatchCoverageGroup[]) {
  if (groups.length === 0) {
    layout.doc.setFontSize(9);
    layout.doc.text("None — no partial gaps.", layout.margin, layout.y);
    layout.y += 16;
    return;
  }

  autoTable(layout.doc, {
    startY: layout.y,
    head: [["Collection", "Book #", "Catalog", "Have", "Missing", "%", "Missing fabric #"]],
    body: groups.map((group) => [
      group.collection,
      group.book_number,
      String(group.catalog_count),
      String(group.have_count),
      String(group.missing_count),
      `${group.coverage_pct}%`,
      formatMissingFabricList(group.missing_fabric_numbers),
    ]),
    margin: { left: layout.margin, right: layout.margin, top: layout.margin, bottom: layout.margin },
    tableWidth: layout.tableWidth,
    styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: [30, 41, 59], fontSize: 8, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: layout.tableWidth * 0.18 },
      1: { cellWidth: layout.tableWidth * 0.07, halign: "center" },
      2: { cellWidth: layout.tableWidth * 0.07, halign: "right" },
      3: { cellWidth: layout.tableWidth * 0.07, halign: "right" },
      4: { cellWidth: layout.tableWidth * 0.07, halign: "right" },
      5: { cellWidth: layout.tableWidth * 0.06, halign: "right" },
      6: { cellWidth: layout.tableWidth * 0.48 },
    },
    theme: "striped",
  });

  layout.y = (layout.doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;
}

function renderMillLineSection(layout: PdfLayout, report: MillLineSwatchGapReport) {
  millLinePartHead(layout, report);

  sectionHead(
    layout,
    report.mill_line === "solbiati" ? "No swatch photos (0%)" : "Books with no swatch photos (0%)",
    `${report.zero.length} ${report.mill_line === "solbiati" ? "collection" : "book"}${report.zero.length === 1 ? "" : "s"} with zero imported swatches`
  );
  renderZeroTable(layout, report.zero);

  sectionHead(
    layout,
    "Partial coverage",
    `${report.partial.length} ${report.mill_line === "solbiati" ? "collection" : "book"}${report.partial.length === 1 ? "" : "s"} with gaps remaining`
  );
  renderPartialTable(layout, report.partial);
}

export function generateLoroPianaSolbiatiSwatchesMissingPdf(): Uint8Array {
  const manifest = readLoroPianaSwatchManifest();
  const importedAt = manifest.imported_at ?? new Date().toISOString();
  const { loro_piana, solbiati } = compileLoroPianaSolbiatiSwatchesMissing();

  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const margin = 42;
  const pageWidth = doc.internal.pageSize.getWidth();
  const tableWidth = pageWidth - margin * 2;
  const layout: PdfLayout = { doc, margin, pageWidth, tableWidth, y: margin };

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Loro Piana & Solbiati — swatches still missing", margin, layout.y);
  layout.y += 22;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60);
  doc.text(
    `Generated ${formatGeneratedDate(importedAt)} · Loro Piana: ${loro_piana.total_missing} missing · Solbiati: ${solbiati.total_missing} missing`,
    margin,
    layout.y
  );
  layout.y += 14;

  doc.setFontSize(9);
  doc.text(
    "Compared against catalog (loro-piana-ss26.json) and imported swatches (manifest.json). Solbiati = S-prefix codes; Loro Piana = numeric codes.",
    margin,
    layout.y,
    { maxWidth: tableWidth }
  );
  layout.y += 28;
  doc.setTextColor(0);

  renderMillLineSection(layout, loro_piana);
  ensureSpace(layout, 100);
  layout.doc.addPage();
  layout.y = margin;
  renderMillLineSection(layout, solbiati);

  return new Uint8Array(doc.output("arraybuffer"));
}
