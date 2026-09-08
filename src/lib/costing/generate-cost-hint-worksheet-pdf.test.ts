import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { generateCostHintWorksheetPdf } from "@/lib/costing/generate-cost-hint-worksheet-pdf";
import type { CostHintWorksheet } from "@/lib/costing/cost-hint-worksheet";

describe("cost hint worksheet PDF", () => {
  it("stays valid UTF-8 ASCII in the helper source", () => {
    const source = readFileSync("src/lib/costing/generate-cost-hint-worksheet-pdf.ts");
    assert.equal(source.includes(Buffer.from([0xb7])), false);
    source.toString("utf8");
    assert.equal([...source].every((byte) => byte < 128), true);
  });

  it("builds a PDF that names cost hint and stays internal", async () => {
    const worksheet: CostHintWorksheet = {
      title: "Cost hint worksheet",
      subtitle: "Internal. Do not send to the client. all orders.",
      generated_at: "2026-09-07T12:00:00.000Z",
      missing_price_count: 0,
      rows: [
        {
          so_number: "SO-2026-0117",
          invoice_number: "INV-2026-0015",
          client_name: "Ibrahim",
          client_code: "FR-0726-0037",
          article_label: "L03",
          garment: "Jacket",
          fabric_number: "360103",
          fabric_brand: "Caccioppoli",
          supplier_id: "caccioppoli",
          composition: "65% wool 35% silk",
          weight_gsm: 240,
          color: "light blu",
          quantity: 2,
          fabric_cost_sar: 790.02,
          cost_hint_sar: 1190.02,
          unit_price_sar: 1190.02,
          missing_price: false,
          article_count: 2,
        },
        {
          so_number: "SO-2026-0117",
          invoice_number: "INV-2026-0015",
          client_name: "Ibrahim",
          client_code: "FR-0726-0037",
          article_label: "L04",
          garment: "Shirt LS",
          fabric_number: "360200",
          fabric_brand: "Caccioppoli",
          supplier_id: "caccioppoli",
          composition: "100% cotton",
          weight_gsm: 120,
          color: "white",
          quantity: 10,
          fabric_cost_sar: 200,
          cost_hint_sar: 400,
          unit_price_sar: 400,
          missing_price: false,
          article_count: 10,
        },
        {
          so_number: "SO-2026-0117",
          invoice_number: "INV-2026-0015",
          client_name: "Ibrahim",
          client_code: "FR-0726-0037",
          article_label: "L05",
          garment: "Overshirt",
          fabric_number: "360201",
          fabric_brand: "Caccioppoli",
          supplier_id: "caccioppoli",
          composition: "100% linen",
          weight_gsm: 200,
          color: "navy",
          quantity: 8,
          fabric_cost_sar: 180,
          cost_hint_sar: 360,
          unit_price_sar: 360,
          missing_price: false,
          article_count: 8,
        },
        {
          so_number: "SO-2026-0117",
          invoice_number: "INV-2026-0015",
          client_name: "Ibrahim",
          client_code: "FR-0726-0037",
          article_label: "L06",
          garment: "Suit",
          fabric_number: "360202",
          fabric_brand: "Caccioppoli",
          supplier_id: "caccioppoli",
          composition: "100% wool",
          weight_gsm: 260,
          color: "grey",
          quantity: 2,
          fabric_cost_sar: 900,
          cost_hint_sar: 1400,
          unit_price_sar: 1400,
          missing_price: false,
          article_count: 2,
        },
      ],
    };
    const bytes = await generateCostHintWorksheetPdf(worksheet);
    assert.ok(bytes.byteLength > 200);
    const text = Buffer.from(bytes).toString("latin1");
    assert.match(text, /INTERNAL/);
    assert.match(text, /Cost hint/);
    assert.match(text, /Swatch/);
    assert.match(text, /Brand/);
    assert.match(text, /Comp/);
    assert.match(text, /Weight/);
    assert.match(text, /Caccioppoli/);
    assert.match(text, /240 gsm/);
    assert.match(text, /65% Wool/);
    assert.match(text, /10 Shirts/);
    assert.match(text, /8 Overshirts/);
    assert.match(text, /2 Trousers/);
    assert.match(text, /Total: 24 pcs/);
  });
});
