import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import loroPianaCatalog from "@/data/suppliers/loro-piana-ss26.json";
import { readLoroPianaSwatchManifest } from "@/lib/fabric-sourcing/loro-piana-swatches";

export type LoroPianaBookCoverage = {
  book_number: string;
  collection: string;
  catalog_count: number;
  have_count: number;
  missing_count: number;
  coverage_pct: number;
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
