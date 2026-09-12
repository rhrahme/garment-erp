/**
 * Read-only audit of draft invoices, line by line.
 *
 * Drafts are the ones still worth arguing about: nothing has been sent and
 * nobody has paid, so anything wrong here is still cheap to fix. Sent and paid
 * invoices are reported at the end as a count only - correcting those is a
 * conversation with a client, not an edit.
 *
 * Per line this reports what the client's PDF will actually print, how the
 * line found its way back to a fabric line on the order, and whether the money
 * on it adds up. Prices are reported, never changed.
 *
 * Run: node --experimental-strip-types --experimental-loader \
 *   ./scripts/tsconfig-paths-loader.mjs scripts/audit-draft-invoices.ts
 */
import { readFileSync } from "node:fs";
import { enrichInvoiceLinesWithFabricDetails } from "@/lib/invoicing/build-invoice";
import { resolveInvoiceVatRate } from "@/lib/invoicing/vat";
import { resolveFabricItemFromCatalog } from "@/lib/fabric-sourcing/resolve-fabric-from-catalog";
import { findFabricCatalogOwner } from "@/lib/fabric-sourcing/fabric-catalog-owner";
import { lineArticleFromStickerCode, soArticleFromFabricLine } from "@/lib/sales-orders/label-codes";
import type { CustomerInvoice, CustomerInvoiceLine } from "@/lib/types/customer-invoices";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

const round2 = (value: number): number => Math.round(value * 100) / 100;

const orders = (
  JSON.parse(readFileSync("src/data/sales-orders.json", "utf8")).orders ?? []
) as SalesOrder[];
const invoices = (
  JSON.parse(readFileSync("src/data/customer-invoices.json", "utf8")).invoices ?? []
) as CustomerInvoice[];

const orderById = new Map(orders.map((order) => [order.id, order]));
const orderByNumber = new Map(orders.map((order) => [order.so_number, order]));

/**
 * Which tier of the match chain answered for this line.
 *
 * The chain in findFabricLineForInvoiceLine ends in a garment-type guess, and
 * a line that gets there is holding whatever cloth happened to share its
 * garment type. That is worth naming rather than leaving implicit.
 */
type MatchTier = "line_id" | "sticker" | "article" | "fabric_number" | "garment_type_guess" | "none";

function matchTier(
  order: SalesOrder | undefined,
  line: CustomerInvoiceLine
): { tier: MatchTier; fabricLine: SalesOrderFabricLine | undefined } {
  if (!order) return { tier: "none", fabricLine: undefined };
  const lines = order.fabric_lines ?? [];

  if (line.sales_order_line_id) {
    const byId = lines.find((row) => row.id === line.sales_order_line_id);
    if (byId) return { tier: "line_id", fabricLine: byId };
  }
  if (line.sticker_code) {
    const bySticker = lines.find((row) =>
      row.label_stickers?.some((sticker) => sticker.code === line.sticker_code)
    );
    if (bySticker) return { tier: "sticker", fabricLine: bySticker };

    const article = lineArticleFromStickerCode(line.sticker_code);
    if (article != null) {
      const byArticle = lines.find((row) => soArticleFromFabricLine(row) === article);
      if (byArticle) return { tier: "article", fabricLine: byArticle };
    }
  }
  if (line.fabric_number) {
    const byFabric = lines.find((row) => row.fabric_number === line.fabric_number);
    if (byFabric) return { tier: "fabric_number", fabricLine: byFabric };
  }
  const guess = lines.find(
    (row) =>
      row.garment_type === line.garment_type &&
      (line.piece_name == null ||
        row.label_stickers?.some((sticker) => sticker.piece_name === line.piece_name))
  );
  return { tier: guess ? "garment_type_guess" : "none", fabricLine: guess };
}

const problems: string[] = [];
const note = (invoice: string, message: string) => problems.push(`${invoice}: ${message}`);

const drafts = invoices.filter((invoice) => invoice.status === "draft");
const settled = invoices.filter((invoice) => invoice.status !== "draft");

console.log(`Draft invoices: ${drafts.length} of ${invoices.length}`);
console.log(`(${settled.length} already sent or paid, listed at the end)\n`);

for (const invoice of drafts) {
  const order =
    orderById.get(invoice.sales_order_id ?? "") ?? orderByNumber.get(invoice.so_number ?? "");
  const stored = invoice.lines ?? [];
  const printed = enrichInvoiceLinesWithFabricDetails(stored, order);

  const vatRate = invoice.vat_rate ?? 0;
  const expectedVat = resolveInvoiceVatRate(invoice.delivery_destination as never) ?? 0;

  console.log("=".repeat(96));
  console.log(
    `${invoice.invoice_number}  ${invoice.client_name}  |  ${invoice.so_number}  |  ` +
      `${invoice.delivery_destination ?? "no destination"}  |  ${invoice.currency} ${invoice.total}`
  );
  console.log("=".repeat(96));

  if (!order) {
    note(invoice.invoice_number, `sales order ${invoice.so_number} is not in this snapshot`);
    console.log(`  !! sales order ${invoice.so_number} not in this snapshot - lines unverifiable\n`);
    continue;
  }

  const seenArticles = new Map<number, number>();
  const seenStickers = new Map<string, number>();
  let subtotal = 0;

  console.log(
    "  art  garment                 fabric #          brand         qty   unit      total  match          spec"
  );
  for (const [index, line] of printed.entries()) {
    const raw = stored[index]!;
    const { tier, fabricLine } = matchTier(order, raw);
    const qty = line.quantity ?? 0;
    const unit = line.unit_price ?? 0;
    const total = line.line_total ?? 0;
    subtotal += total;

    const expectedTotal = round2(qty * unit);
    const arithmeticOk = Math.abs(expectedTotal - total) <= 0.01;

    const supplierId = fabricLine?.supplier_id ?? "";
    const number = String(line.fabric_number ?? "").trim();
    const inList = number ? !resolveFabricItemFromCatalog(supplierId, number).manual : false;
    const printsSpec = Boolean(line.composition) || line.weight_gsm != null;
    const spec = !number
      ? "NO NUMBER"
      : inList
        ? `${line.composition ?? "-"} ${line.weight_gsm ?? "-"}g`
        : printsSpec
          ? "UNBACKED"
          : "blank";

    console.log(
      `  ${String(line.article_number ?? "-").padStart(3)}  ` +
        `${String(line.garment_type ?? "-").padEnd(22).slice(0, 22)}  ` +
        `${number.padEnd(16).slice(0, 16)}  ` +
        `${String(line.fabric_brand ?? "-").padEnd(12).slice(0, 12)}  ` +
        `${String(qty).padStart(3)}  ${String(unit).padStart(7)}  ${String(total).padStart(9)}  ` +
        `${tier.padEnd(13)}  ${spec}`
    );

    if (line.article_number != null) {
      seenArticles.set(line.article_number, (seenArticles.get(line.article_number) ?? 0) + 1);
    }
    if (line.sticker_code) {
      seenStickers.set(line.sticker_code, (seenStickers.get(line.sticker_code) ?? 0) + 1);
    }
    if (!arithmeticOk) {
      note(
        invoice.invoice_number,
        `article ${line.article_number}: ${qty} x ${unit} is ${expectedTotal}, line says ${total}`
      );
    }
    if (unit === 0 || total === 0) {
      note(invoice.invoice_number, `article ${line.article_number} (${line.garment_type}) has no price`);
    }
    if (tier === "garment_type_guess") {
      note(
        invoice.invoice_number,
        `article ${line.article_number} matched its order line by garment type alone - it may be carrying another article's cloth`
      );
    }
    if (tier === "none") {
      note(invoice.invoice_number, `article ${line.article_number} matches no fabric line on the order`);
    }
    if (spec === "UNBACKED") {
      note(
        invoice.invoice_number,
        `article ${line.article_number} prints a spec no price list backs`
      );
    }
    if (spec === "blank" && number) {
      const owner = findFabricCatalogOwner(number);
      const where =
        owner && owner.supplier_id !== supplierId
          ? ` - ${owner.supplier_name} lists it, but the line says "${supplierId}"`
          : " - no uploaded price list has this number";
      note(invoice.invoice_number, `article ${line.article_number} prints blank specs (${number})${where}`);
    }
    if (!number) {
      note(invoice.invoice_number, `article ${line.article_number} has no fabric number`);
    }
  }

  for (const [article, count] of seenArticles) {
    if (count > 1) note(invoice.invoice_number, `article ${article} appears on ${count} lines`);
  }
  for (const [code, count] of seenStickers) {
    if (count > 1) note(invoice.invoice_number, `sticker ${code} appears on ${count} lines`);
  }

  // One cloth, one description. Where a stored composition states fibre
  // percentages it beats a catalog row that only names the fibres, which is
  // right on its own - but a line of the same cloth with nothing stored falls
  // back to the vaguer catalog text, and the client reads the same fabric
  // number described two ways on one page.
  const describedAs = new Map<string, Set<string>>();
  for (const line of printed) {
    const number = String(line.fabric_number ?? "").trim();
    if (!number) continue;
    const description = `${line.composition ?? "(blank)"} / ${line.weight_gsm ?? "-"}g`;
    if (!describedAs.has(number)) describedAs.set(number, new Set());
    describedAs.get(number)!.add(description);
  }
  for (const [number, descriptions] of describedAs) {
    if (descriptions.size > 1) {
      note(
        invoice.invoice_number,
        `${number} is described ${descriptions.size} different ways: ${[...descriptions].join(" / vs / ")}`
      );
    }
  }

  subtotal = round2(subtotal);
  const storedSubtotal = invoice.subtotal ?? 0;
  const vatAmount = vatRate > 0 ? round2(storedSubtotal * vatRate) : 0;
  const total = round2(storedSubtotal + vatAmount);

  console.log(
    `\n  lines add to ${subtotal}  |  subtotal ${storedSubtotal}  |  ` +
      `VAT ${(vatRate * 100).toFixed(0)}% = ${invoice.vat_amount ?? 0}  |  total ${invoice.total}`
  );

  if (Math.abs(subtotal - storedSubtotal) > 0.01) {
    note(invoice.invoice_number, `lines add to ${subtotal} but subtotal says ${storedSubtotal}`);
  }
  if (Math.abs(vatRate - expectedVat) > 0.0001) {
    note(
      invoice.invoice_number,
      `VAT is ${(vatRate * 100).toFixed(0)}% but ${invoice.delivery_destination ?? "no destination"} calls for ${(expectedVat * 100).toFixed(0)}%`
    );
  }
  if (Math.abs(vatAmount - (invoice.vat_amount ?? 0)) > 0.01) {
    note(invoice.invoice_number, `VAT should be ${vatAmount}, invoice says ${invoice.vat_amount}`);
  }
  if (Math.abs(total - (invoice.total ?? 0)) > 0.01) {
    note(invoice.invoice_number, `total should be ${total}, invoice says ${invoice.total}`);
  }
  if (!invoice.delivery_destination) {
    note(invoice.invoice_number, "no delivery destination, so VAT cannot be decided");
  }

  // Everything cut for this order should be billed exactly once.
  //
  // Counting invoice lines against order lines gets this wrong: consolidation
  // merges several order lines into one invoice line carrying a quantity, and
  // only one of their ids survives on it. Counting garments per type survives
  // that, because merging four shirts into one line of four still bills four
  // shirts.
  const madeByType = new Map<string, number>();
  for (const row of order.fabric_lines ?? []) {
    madeByType.set(row.garment_type, (madeByType.get(row.garment_type) ?? 0) + 1);
  }
  const billedByType = new Map<string, number>();
  for (const line of stored) {
    const type = line.garment_type ?? "";
    billedByType.set(type, (billedByType.get(type) ?? 0) + (line.quantity ?? 0));
  }
  for (const type of new Set([...madeByType.keys(), ...billedByType.keys()])) {
    const made = madeByType.get(type) ?? 0;
    const billed = billedByType.get(type) ?? 0;
    if (made > billed) {
      note(invoice.invoice_number, `${made - billed} ${type} made on ${order.so_number} but not billed`);
    } else if (billed > made) {
      note(
        invoice.invoice_number,
        `${billed - made} more ${type} billed than ${order.so_number} has fabric lines for`
      );
    }
  }

  // A line whose garment type disagrees with its own order line is being sold
  // as something other than what was cut.
  for (const [index, line] of printed.entries()) {
    const { fabricLine } = matchTier(order, stored[index]!);
    if (!fabricLine) continue;
    if (fabricLine.garment_type !== line.garment_type) {
      note(
        invoice.invoice_number,
        `article ${line.article_number} is billed as "${line.garment_type}" but ${order.so_number} cut it as "${fabricLine.garment_type}"`
      );
    }
  }
  console.log("");
}

console.log("=".repeat(96));
console.log(`FINDINGS (${problems.length})`);
console.log("=".repeat(96));
for (const problem of problems) console.log(`  ${problem}`);

console.log(`\nAlready sent or paid, not reviewed here (${settled.length}):`);
for (const invoice of settled) {
  console.log(`  ${invoice.invoice_number}  ${invoice.client_name}  (${invoice.status})`);
}
