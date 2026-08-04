/**
 * Prefill Al Ajlan family customer invoices (Aug 4, 2026) with the agreed
 * suggested prices from the pricing proposal (based on INV-2026-0007 logic).
 * User approved: "prefill each invoice, i will review them" - DRAFTS ONLY.
 *
 * Uses the app's own code paths (buildDraftInvoiceFromSalesOrder,
 * saveCustomerInvoice, notifyIntegration) so numbering, totals, VAT and
 * integration events stay consistent. saveCustomerInvoice writes Supabase
 * (production) + mirrors the local JSON file.
 *
 *   node --experimental-strip-types --import ./scripts/tsconfig-paths-loader.mjs \
 *     scripts/prefill-al-ajlan-invoices.mts [--dry-run]
 */
import fs from "node:fs";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && process.env[match[1]!] === undefined) {
    process.env[match[1]!] = match[2]!;
  }
}

const DRY_RUN = process.argv.includes("--dry-run");
const ACTOR = "agent:al-ajlan-prefill";

const { ensureDocumentsLoaded } = await import("@/lib/data/document-persistence");
const {
  generateInvoiceId,
  generateInvoiceNumber,
  readCustomerInvoicesFresh,
  saveCustomerInvoice,
} = await import("@/lib/data/customer-invoices");
const { readSalesOrdersFresh } = await import("@/lib/data/sales-orders");
const {
  buildDraftInvoiceFromSalesOrder,
  buildInvoiceLinesFromSalesOrder,
  recalculateInvoiceTotals,
} = await import("@/lib/invoicing/build-invoice");
const { applySuitCombine } = await import("@/lib/invoicing/suit-combine-lines");
const { resolveInvoiceLines } = await import("@/lib/invoicing/display");
// The @/lib/integrations index re-exports api-auth (next/server) which cannot
// load outside Next ù use the same underlying log + Zapier emit directly.
const { logIntegrationEvent } = await import("@/lib/integrations/event-log");
const { emitZapierEvent } = await import("@/lib/integrations/zapier");

async function notifyIntegration(event: string, data: Record<string, unknown>): Promise<void> {
  const payload = { ...data, _source: "erp" };
  await Promise.all([logIntegrationEvent(event, payload), emitZapierEvent(event as never, payload)]);
}

type Money = number;

interface NewInvoiceSpec {
  so_number: string;
  /** unit price per sales_order_line_id (set price for combined set lines) */
  prices: Record<string, Money>;
  expected_subtotal: Money;
  expected_vat: Money;
  expected_total: Money;
  notes: string;
}

const REVIEW_SUFFIX = "DRAFT prefilled 2026-08-04 from the Al Ajlan pricing proposal (INV-2026-0007 price logic); user will review before sending.";

// ---------------------------------------------------------------------------
// 1) Fill existing empty draft INV-2026-0002 (SO-2026-0108, DXB, no VAT)
//    Prices by article number; A21 shirt+trouser pair combines to one set line.
const INV_0002_PRICES_BY_ARTICLE: Record<number, Money> = {
  1: 3500, 2: 3500, 3: 3500, 4: 3500, // Trouser LP Zelander merino
  5: 3500, 6: 3500, 7: 3500, // Trouser LP linen/silk
  8: 2000, // Trouser Solbiati Gabardilia cotton
  9: 2500, 10: 2500, // Shirt LS Solbiati twisted linen
  11: 2100, 12: 2100, // Shirt LS LP cotton / cotton-linen
  13: 2000, 14: 2000, // Trouser Drapers cotton stretch
  15: 3300, 16: 3300, 17: 3300, 18: 3300, 19: 3300, 20: 3300, // Shirt LS LP Summertime
  21: 6100, // Shirt+Trouser set LP 771034
};
const INV_0002_EXPECTED_SUBTOTAL = 65600;

// ---------------------------------------------------------------------------
// 2) New drafts, in invoice-number order.
const NEW_INVOICES: NewInvoiceSpec[] = [
  {
    so_number: "SO-2026-0125",
    prices: {
      "line-xfer-in-1784705520850": 4900, // A1 Shirt+Short Caccioppoli 206221
      "line-xfer-in-1784705599258": 4900, // A2 Shirt+Short Caccioppoli 206222
      "line-1784910614436-5": 7500, // A3 Overshirt+Trouser Solbiati PEGASO S14019
      "line-1784910707621-6": 7500, // A4 S14020
      "line-1784910748839-7": 7500, // A5 S14023
      "line-1784910784948-8": 7500, // A6 S14024
      "line-1784910816908-9": 7500, // A7 S14032
      "line-1784910868864-10": 7500, // A8 S14039
      "line-1784910897427-11": 7500, // A9 S14040
      "line-1784918048528-13": 1800, // A10 T-shirt LP 722056
      "line-1784918620930-14": 1800, // A11 T-shirt LP 722042
      "line-1784918695190-14": 1800, // A12 T-shirt LP 722043
      "line-1784918730274-15": 1800, // A13 T-shirt LP 722048
      "line-1785078685896-15": 1800, // A14 T-shirt LP 722042
      "line-xfer-repl-1785088269716": 3000, // A15 Trouser Zegna 66046 - PLACEHOLDER
      "line-1785670850854-16": 7500, // A16 Overshirt+Trouser Solbiati PEGASO S14025
    },
    expected_subtotal: 81800,
    expected_vat: 0,
    expected_total: 81800,
    notes:
      "Invoiced from SO-2026-0125 only: it supersedes SO-2026-0118 (same Caccioppoli " +
      "and Solbiati PEGASO fabrics, corrected meterage), so SO-2026-0118 was " +
      "intentionally not invoiced. FLAG A15 Trouser Zegna 66046 at 3,000 SAR is a " +
      "placeholder price (no Zegna catalog price on file) - review. " +
      REVIEW_SUFFIX,
  },
  {
    so_number: "SO-2026-0107",
    prices: {
      "line-1781358783221-0": 2100, // A1 Shirt LS LP 722041 (knit)
      "line-1781358783221-1": 2100, // A2 722042
      "line-1781358783221-2": 2100, // A3 722043
      "line-1781358783221-3": 2100, // A4 722045
      "line-1781358783221-4": 2100, // A5 722052
      "line-1781358783221-5": 2100, // A6 722040
      "line-1781358783221-6": 2100, // A7 722053
      "line-1781358783221-7": 2100, // A8 722054
      "line-1781358783221-8": 2100, // A9 722051
      "line-1781358783221-9": 5100, // A10 Jacket LP Summertime 780013
      "line-1781358783221-10": 5100, // A11 Jacket LP Summertime 780045
      "line-1781358783221-11": 2000, // A12 Trouser Drapers 26136 (4.8 m - FLAG)
      "line-1781358783222-12": 2000, // A13 Trouser Drapers 26130
      "line-1781358783222-13": 5100, // A14 Jacket Solbiati NOBEL S24042
      "line-1781358783222-14": 5100, // A15 Jacket Solbiati NOBEL S24045
      "line-1785671776217-16": 2000, // A16 Trouser Drapers 26136
      "line-1785671835953-17": 2000, // A17 Trouser Drapers 26136
      "line-1785671873327-18": 2000, // A18 Trouser Drapers 26136
    },
    expected_subtotal: 49300,
    expected_vat: 7395,
    expected_total: 56695,
    notes:
      "15% Saudi VAT applied (RUH delivery), same as other RUH invoices. " +
      "FLAG A12 Trouser Drapers 26136 has 4.8 m ordered - possibly 4 pieces but " +
      "only 1 invoiced at 2,000 SAR; review quantity. " +
      REVIEW_SUFFIX,
  },
  {
    so_number: "SO-2026-0122",
    prices: {
      "line-1784465942963-0": 4100, // A1 Shirt+Trouser set Gazaba BOL002
      "line-1784465942963-2": 2000, // A2 Trouser Drapers 26136
      "line-1784465942964-3": 2000, // A3 Trouser Drapers 26136
      "line-1784465942964-4": 2100, // A4 Shirt LS LP 722042
      "line-1785672336948-5": 2000, // A5 Trouser Gazaba BOL002
    },
    expected_subtotal: 12200,
    expected_vat: 1830,
    expected_total: 14030,
    notes:
      "15% Saudi VAT applied (RUH delivery), same as other RUH invoices. " +
      REVIEW_SUFFIX,
  },
  {
    so_number: "SO-2026-0129",
    prices: {
      "line-xfer-in-1785088269715": 3000, // A1 Trouser Zegna 66046 - PLACEHOLDER
      "line-1785667934756-2": 7800, // A2 Overshirt+Trouser LP Summertime 771006
      "line-1785668112428-3": 3300, // A3 Short LP Summertime 771006
      "line-1785668163859-4": 7800, // A4 Overshirt+Trouser LP Summertime 771001
      "line-1785668196287-5": 3300, // A5 Short LP Summertime 771001
      "line-1785668227585-6": 7800, // A6 Overshirt+Trouser LP Summertime 771010
      "line-1785668270958-7": 3300, // A7 Short LP Summertime 771010
      "line-1785668299775-8": 7800, // A8 Overshirt+Trouser LP Summertime 771002
      "line-1785668349534-9": 3300, // A9 Short LP Summertime 771002
      "line-1785668386037-10": 7800, // A10 Overshirt+Trouser LP 781036
      "line-1785668416266-11": 3300, // A11 Short LP 781036
      "line-1785668451033-12": 7800, // A12 Overshirt+Trouser LP 781034
      "line-1785668480064-13": 3300, // A13 Short LP 781034
      "line-1785668511474-14": 4800, // A14 Overshirt LP 781031
      "line-1785668553040-15": 2100, // A15 Shirt LS Stylbiella 71525/056
      "line-1785668635611-16": 2500, // A16 Shirt LS Solbiati S25024 - PLACEHOLDER
      "line-1785668686641-17": 2100, // A17 Shirt LS Solbiati Frescolino S16016
      "line-1785668748488-18": 3300, // A18 Shirt LS LP 771011
      "line-1785668834675-19": 2500, // A19 Shirt SS LP Zelander 781050 - NEW TYPE
      "line-1785668873008-20": 3300, // A20 Short LP Zelander 781050
      "line-1785668913671-21": 2800, // A21 Short Stylbiella 71577/062
    },
    expected_subtotal: 93000,
    expected_vat: 0,
    expected_total: 93000,
    notes:
      "FLAG A1 Trouser Zegna 66046 at 3,000 SAR is a placeholder price (no Zegna " +
      "catalog price on file) - review. FLAG A16 Shirt LS Solbiati S25024 at 2,500 SAR " +
      "is a placeholder price - review. FLAG A19 Shirt SS LP Zelander 781050 is a new " +
      "garment type priced at 2,500 SAR - review. " +
      REVIEW_SUFFIX,
  },
];

function money(value: number): string {
  return value.toLocaleString("en-US");
}

function printLines(lines: Array<any>): void {
  for (const line of lines) {
    console.log(
      `  A${String(line.article_number ?? "?").padStart(2)} | ` +
        `${String(line.description).padEnd(26)} | ` +
        `${String(line.fabric_brand ?? "").padEnd(12)} ${String(line.fabric_number ?? "").padEnd(11)} | ` +
        `qty ${line.quantity} x ${money(line.unit_price)} = ${money(line.line_total)}`
    );
  }
}

function assertEqual(label: string, actual: number, expected: number): void {
  if (Math.abs(actual - expected) > 0.001) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

await ensureDocumentsLoaded(["customer_invoices", "sales_orders", "costing_rates", "clients"]);

// ---------------------------------------------------------------------------
// Part A: fill INV-2026-0002
{
  const store = await readCustomerInvoicesFresh();
  const invoice = store.invoices.find((row) => row.invoice_number === "INV-2026-0002");
  if (!invoice) throw new Error("INV-2026-0002 not found");
  if (invoice.status !== "draft") throw new Error(`INV-2026-0002 is ${invoice.status}, not draft`);

  const alreadyFilled = invoice.lines.some((line) => line.unit_price > 0);
  if (alreadyFilled) {
    console.log("INV-2026-0002 already has prices - skipping fill.\n");
  } else {
    // Combine the A21 Shirt+Trouser pair into one set line (app suit-combine).
    const combined = applySuitCombine(invoice.lines);
    const priced = combined.map((line) => {
      const price = line.article_number != null ? INV_0002_PRICES_BY_ARTICLE[line.article_number] : undefined;
      if (price == null) {
        throw new Error(`INV-2026-0002: no agreed price for article ${line.article_number} (${line.description})`);
      }
      return { ...line, unit_price: price };
    });
    const seen = new Set(priced.map((line) => line.article_number));
    for (const article of Object.keys(INV_0002_PRICES_BY_ARTICLE)) {
      if (!seen.has(Number(article))) throw new Error(`INV-2026-0002: article ${article} missing from invoice lines`);
    }

    const totals = recalculateInvoiceTotals(resolveInvoiceLines(priced), invoice.vat_rate);
    assertEqual("INV-2026-0002 subtotal", totals.subtotal, INV_0002_EXPECTED_SUBTOTAL);
    assertEqual("INV-2026-0002 vat", totals.vat_amount, 0);
    assertEqual("INV-2026-0002 total", totals.total, INV_0002_EXPECTED_SUBTOTAL);

    const next = {
      ...invoice,
      lines: totals.lines,
      subtotal: totals.subtotal,
      vat_amount: totals.vat_amount,
      total: totals.total,
      notes: "Filled with agreed prices from the Al Ajlan pricing proposal. " + REVIEW_SUFFIX,
    };

    console.log(`INV-2026-0002 (${invoice.so_number}, ${invoice.client_name}, ${invoice.delivery_destination}) - fill:`);
    printLines(next.lines);
    console.log(
      `  subtotal ${money(next.subtotal)} | VAT ${money(next.vat_amount)} | total ${money(next.total)} SAR | status ${next.status}\n`
    );

    if (!DRY_RUN) {
      const saved = await saveCustomerInvoice(next);
      await notifyIntegration("invoice.updated", {
        id: saved.id,
        invoice_number: saved.invoice_number,
        status: saved.status,
        updated_by: ACTOR,
      });
      assertEqual("INV-2026-0002 saved total", saved.total, INV_0002_EXPECTED_SUBTOTAL);
      console.log(`  SAVED ${saved.invoice_number} total ${money(saved.total)} SAR (${saved.status})\n`);
    }
  }
}

// ---------------------------------------------------------------------------
// Part B: create the four new drafts
const ordersStore = await readSalesOrdersFresh();

for (const spec of NEW_INVOICES) {
  const order = ordersStore.orders.find((row) => row.so_number === spec.so_number);
  if (!order) throw new Error(`Sales order not found: ${spec.so_number}`);

  const store = await readCustomerInvoicesFresh();
  const existing = store.invoices.find((row) => row.sales_order_id === order.id);
  if (existing) {
    console.log(`${spec.so_number} already invoiced as ${existing.invoice_number} - skipping.\n`);
    continue;
  }

  const invoiceNumber = generateInvoiceNumber(store.invoices);
  const invoiceId = generateInvoiceId();

  // App envelope: client, VAT by destination, payment terms, cost snapshot.
  const draft = buildDraftInvoiceFromSalesOrder(order, invoiceNumber, invoiceId);

  // Price the raw built lines with the agreed proposal prices, then apply the
  // app's own line reductions (suit combine + consolidation) exactly as the
  // invoice editor's "reduce lines" would with these prices.
  const rawLines = buildInvoiceLinesFromSalesOrder(order);
  const priced = rawLines.map((line) => {
    const price = line.sales_order_line_id ? spec.prices[line.sales_order_line_id] : undefined;
    if (price == null) {
      throw new Error(`${spec.so_number}: no agreed price for line ${line.sales_order_line_id} (${line.description})`);
    }
    return { ...line, unit_price: price, line_total: line.quantity * price };
  });
  const mappedIds = new Set(rawLines.map((line) => line.sales_order_line_id));
  for (const id of Object.keys(spec.prices)) {
    if (!mappedIds.has(id)) throw new Error(`${spec.so_number}: priced line ${id} not present on sales order build`);
  }

  // Keep one row per sales-order article (how the app creates drafts, and how
  // INV-2026-0002 looks) so flagged articles stay addressable and every row
  // keeps its fabric number for review. The reviewer can use the editor's
  // "reduce lines" to consolidate into INV-2026-0007-style qty rows afterward.
  // Deliberately NOT applying reductions here: duplicate-line removal drops
  // rows sharing a fabric number that are real separate garments, and
  // consolidation renumbers articles / mixes fabrics on merged rows.
  const totals = recalculateInvoiceTotals(resolveInvoiceLines(priced), draft.vat_rate);
  assertEqual(`${spec.so_number} subtotal`, totals.subtotal, spec.expected_subtotal);
  assertEqual(`${spec.so_number} vat`, totals.vat_amount, spec.expected_vat);
  assertEqual(`${spec.so_number} total`, totals.total, spec.expected_total);

  const invoice = {
    ...draft,
    lines: totals.lines,
    subtotal: totals.subtotal,
    vat_amount: totals.vat_amount,
    total: totals.total,
    notes: spec.notes,
  };

  console.log(
    `${invoiceNumber} (${spec.so_number}, ${invoice.client_name}, ${invoice.delivery_destination}, VAT ${invoice.vat_rate ?? 0}) - new draft:`
  );
  printLines(invoice.lines);
  console.log(
    `  subtotal ${money(invoice.subtotal)} | VAT ${money(invoice.vat_amount)} | total ${money(invoice.total)} SAR | status ${invoice.status}\n`
  );

  if (!DRY_RUN) {
    const saved = await saveCustomerInvoice(invoice);
    await notifyIntegration("invoice.created", {
      id: saved.id,
      invoice_number: saved.invoice_number,
      sales_order_id: saved.sales_order_id,
      created_by: ACTOR,
      total: saved.total,
    });
    assertEqual(`${saved.invoice_number} saved total`, saved.total, spec.expected_total);
    console.log(`  SAVED ${saved.invoice_number} total ${money(saved.total)} SAR (${saved.status})\n`);
  }
}

console.log(DRY_RUN ? "Dry run - nothing written." : "Done - all invoices written to Supabase + local JSON.");
