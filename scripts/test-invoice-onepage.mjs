import { register } from "node:module";
import { pathToFileURL } from "node:url";
import fs from "node:fs";

register("./scripts/tsconfig-paths-loader.mjs", pathToFileURL("./"));

const { generateCustomerInvoicePdf } = await import("../src/lib/invoicing/generate-pdf.ts");

// Reconstruction of INV-2026-0007 (23 lines) from the reference PDF.
const raw = [
  ["Shirt LS", 'LP 100% COTONE "KNIT SHIRT" STELLINA JACQUARD 140g', 2, 2100, 4200],
  ["Shirt + Short", "LIGHT TWISTED T.P. 100% LINEN 330g", 1, 5800, 5800],
  ["Shirt + Short", "LIGHT TWISTED T.P. 100% LINEN 330g", 1, 5800, 5800],
  ["Shirt LS", "LIGHT TWISTED T.P. 100% LINEN 330g", 4, 2500, 10000],
  ["Short", "LIGHT TWISTED T.P. 100% LINEN 330g", 1, 3300, 3300],
  ["Trouser", "LIGHT TWISTED T.P. 100% LINEN 330g", 2, 3500, 7000],
  ["Overshirt", "SATIN TWISTED 100% LI 500g", 1, 4500, 4500],
  ["Overshirt", 'LP 83% WOOL 10% SILK 5% LINEN 2% EA"SUMMERTIME 2WAYS" 240g', 1, 4800, 4800],
  ["Shirt LS", 'LP 100% WOOL SUPER 150\'S "AUSTRALIS" 250g', 1, 3800, 3800],
  ["Jacket", 'LP 71% WOOL 15% SILK 14% LINEN "SUMMERTIME" 250g', 1, 5100, 5100],
  ["Shirt + Short", 'LP 65% COTTON 35% SILK "SOFTIME" 240g', 1, 5900, 5900],
  ["Shirt + Trouser + Short", 'LP 65% COTTON 35% SILK "SOFTIME" 240g', 1, 8200, 8200],
  ["Shirt + Trouser + Short", 'LP 65% COTTON 35% SILK "SOFTIME" 240g', 1, 8200, 8200],
  ["Shirt LS", 'LP 65% COTTON 35% SILK "SOFTIME" 240g', 1, 3300, 3300],
  ["Overshirt", 'LP 65% COTTON 35% SILK "SOFTIME" 240g', 1, 4800, 4800],
  ["Short", "ZEFIRO 100% COTTON 240g", 3, 2800, 8400],
  ["Shirt LS", 'LP 49% WOOL 30% SILK 21% LINEN "SUMMERTIME" 240g', 1, 3300, 3300],
  ["Jacket", "LP", 1, 6800, 6800],
  ["Trouser", "GABARDILIA 100% COTTON 240g", 6, 2000, 12000],
  ["Jacket", "SB 100% WOOL 250g", 1, 6500, 6500],
  ["Overshirt", "SB 65% WOOL 21% SILK 14% LINEN 240g", 1, 4500.01, 4500.01],
  ["Overshirt + Trouser", "49% Wool.-30% se.-21% li 240g", 1, 7800, 7800],
  ["Shirt LS", "zephir 100% cotton (50U) 110g", 1, 2100, 2100],
];

const lines = raw.map(([garment, comp, qty, unit, total], i) => ({
  article_label: `L${String(i + 1).padStart(2, "0")}`,
  description: garment,
  garment_type: garment,
  piece_name: null,
  composition_label: comp,
  quantity: qty,
  unit_price: unit,
  line_total: total,
}));

const subtotal = 136100.01;

const invoice = {
  invoice_number: "INV-2026-0007",
  invoice_date: "2026-07-08",
  due_date: null,
  client_name: "Mr Abdelaziz Mohamad Al Ajlan",
  client_code: "",
  client_email: null,
  client_address: null,
  so_number: "SO-2026-0119",
  client_reference: "FR-0726-0039",
  payment_terms: null,
  currency: "SAR",
  subtotal,
  vat_rate: null,
  vat_amount: 0,
  total: subtotal,
  factory_brand_name: null,
  delivery_destination: "DXB",
  lines,
};

const bytes = await generateCustomerInvoicePdf(invoice);
fs.writeFileSync("INV-2026-0007-regenerated.pdf", Buffer.from(bytes));

// Count pages by scanning the PDF for /Type /Page objects.
const text = Buffer.from(bytes).toString("latin1");
const pageMatches = text.match(/\/Type\s*\/Page[^s]/g) || [];
console.log(`Lines: ${lines.length}`);
console.log(`Page count: ${pageMatches.length}`);
console.log(`Wrote INV-2026-0007-regenerated.pdf (${bytes.length} bytes)`);
