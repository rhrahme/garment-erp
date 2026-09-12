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
          price_per_meter_sar: 450,
          meters_per_piece: 1.673,
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
          price_per_meter_sar: 180,
          meters_per_piece: 1.058,
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
          price_per_meter_sar: 160,
          meters_per_piece: 1.071,
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
          price_per_meter_sar: 500,
          meters_per_piece: 1.714,
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
    assert.match(text, /1 sales order/);
  });

  it("prints the cloth price and the meters it was based on", async () => {
    const worksheet: CostHintWorksheet = {
      title: "Cost hint worksheet",
      subtitle: "Internal. SAR/m x meters/pc + 5% duty = fabric cost.",
      generated_at: "2026-09-11T12:00:00.000Z",
      missing_price_count: 0,
      rows: [
        {
          so_number: "SO-2026-0111",
          invoice_number: "INV-2026-0018",
          client_name: "Pr Khaled Bin Salman",
          client_code: "FR-0626-0037",
          article_label: "L03",
          garment: "Short",
          fabric_number: "771001",
          fabric_brand: "Loro Piana",
          supplier_id: "loro-piana",
          composition: "100% cotton",
          weight_gsm: 240,
          color: "sand",
          quantity: 12,
          price_per_meter_sar: 180,
          meters_per_piece: 1.6,
          fabric_cost_sar: 302.4,
          cost_hint_sar: 542.4,
          unit_price_sar: 535.87,
          missing_price: false,
          article_count: 12,
        },
      ],
    };
    const text = Buffer.from(await generateCostHintWorksheetPdf(worksheet)).toString("latin1");

    assert.match(text, /SAR\/m/, "the price per meter column is printed");
    assert.match(text, /Meters\/pc/, "the meters column is printed");
    assert.match(text, /1.6 m/, "the meters value reaches the page");
    assert.doesNotMatch(text, /Suggested/, "nothing to suggest, so no column and no note");
  });

  it("prints the suggested column only when a cut has a suggestion", async () => {
    const worksheet: CostHintWorksheet = {
      title: "Cost hint worksheet",
      subtitle: "Internal.",
      generated_at: "2026-09-12T12:00:00.000Z",
      missing_price_count: 0,
      rows: [
        {
          so_number: "SO-2026-0119",
          invoice_number: null,
          client_name: "Abdelaziz Mohamad Al Ajlan",
          client_code: "FR-0726-0039",
          article_label: "L05",
          garment: "Shirt LS",
          fabric_number: "781060",
          fabric_brand: "Loro Piana",
          supplier_id: "loro-piana",
          composition: "100% wool",
          weight_gsm: 250,
          color: null,
          quantity: 1,
          price_per_meter_sar: 123.5,
          meters_per_piece: 1.5,
          fabric_cost_sar: 875.31,
          cost_hint_sar: 1095.31,
          unit_price_sar: null,
          suggested_price_sar: 3800,
          suggested_price_basis: "781059 on INV-2026-0002",
          missing_price: false,
          article_count: 1,
        },
      ],
    };
    const text = Buffer.from(await generateCostHintWorksheetPdf(worksheet)).toString("latin1");

    assert.match(text, /Suggested/, "the column is there when there is something to suggest");
    assert.match(text, /3,800/, "the figure reaches the page");
    assert.match(text, /Nobody has been billed it/, "the sheet says what the figure is not");
  });
});
