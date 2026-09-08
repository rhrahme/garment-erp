import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  articleLabelFromNumber,
  buildCostHintWorksheet,
  buildCostHintWorksheetFromInvoice,
  costHintSwatchUrl,
  formatCostHintComposition,
  formatCostHintWeight,
  pieceCountForFabricLine,
  unitCostFromLineTotal,
} from "@/lib/costing/cost-hint-worksheet";
import type { CostingOverview, SalesOrderCost } from "@/lib/costing/compute";
import type { CustomerInvoice } from "@/lib/types/customer-invoices";
import type { SalesOrder } from "@/lib/types/sales-orders";

function overviewOf(order: SalesOrderCost): CostingOverview {
  return {
    currency: "SAR",
    order_count: 1,
    line_count: order.line_count,
    lines_missing_price: order.lines_missing_price,
    fabric_base_sar: order.fabric_base_sar,
    customs_duty_sar: order.customs_duty_sar,
    import_vat_sar: 0,
    vat_recoverable_sar: 0,
    fabric_cash_outlay_sar: 0,
    fabric_cost_sar: order.fabric_cost_sar,
    labor_cost_sar: order.labor_cost_sar,
    washing_cost_sar: order.washing_cost_sar,
    overhead_cost_sar: order.overhead_cost_sar,
    total_cost_sar: order.total_cost_sar,
    orders: [order],
  };
}

describe("cost hint worksheet", () => {
  it("splits line cost by sticker count so the hint is per piece", () => {
    assert.equal(articleLabelFromNumber(3), "L03");
    assert.equal(
      pieceCountForFabricLine({
        label_count: 2,
        label_stickers: [
          { code: "A", piece_name: "Jacket", sequence: 1 },
          { code: "B", piece_name: "Jacket", sequence: 2 },
        ],
      }),
      2
    );
    assert.equal(unitCostFromLineTotal(2080.04, 2), 1040.02);
    assert.equal(unitCostFromLineTotal(null, 1), null);
  });

  it("builds sitewide rows and keeps missing fabric prices blank", () => {
    const orderCost = {
      order_id: "so-1",
      so_number: "SO-2026-0117",
      client_name: "Ibrahim Al Shwemi",
      client_code: "FR-0726-0037",
      client_reference: null,
      product_article: null,
      order_date: "2026-07-05",
      status: "fabric_pos_created",
      is_archived: false,
      line_count: 2,
      lines_missing_price: 1,
      fabric_base_sar: 752.4,
      customs_duty_sar: 37.62,
      import_vat_sar: 0,
      vat_recoverable_sar: 0,
      fabric_cash_outlay_sar: 0,
      fabric_cost_sar: 790.02,
      labor_cost_sar: 280,
      washing_cost_sar: 50,
      overhead_cost_sar: 70,
      total_cost_sar: 1190.02,
      lines: [
        {
          line_id: "line-jkt",
          article_number: 3,
          fabric_number: "360103",
          supplier_id: "caccioppoli",
          supplier_name: "Caccioppoli",
          garment_type: "Jacket",
          composition: "65% wool",
          weight_gsm: 240,
          width_label: "150 cm",
          color: "light blu",
          meters: 1.9,
          unit: "meters",
          unit_price: 88,
          supplier_line_total: 167.2,
          fabric_base_sar: 752.4,
          customs_duty_sar: 37.62,
          import_vat_sar: 0,
          vat_recoverable_sar: 0,
          fabric_cash_outlay_sar: 0,
          fabric_cost_sar: 790.02,
          labor_cost_sar: 280,
          washing_cost_sar: 50,
          overhead_cost_sar: 70,
          total_cost_sar: 1190.02,
          has_fabric_price: true,
        },
        {
          line_id: "line-tr",
          article_number: 4,
          fabric_number: "350374",
          supplier_id: "caccioppoli",
          supplier_name: "Caccioppoli",
          garment_type: "Trouser",
          composition: null,
          weight_gsm: null,
          width_label: null,
          color: null,
          meters: 1.3,
          unit: "meters",
          unit_price: null,
          supplier_line_total: null,
          fabric_base_sar: null,
          customs_duty_sar: 0,
          import_vat_sar: 0,
          vat_recoverable_sar: 0,
          fabric_cash_outlay_sar: null,
          fabric_cost_sar: null,
          labor_cost_sar: 180,
          washing_cost_sar: 40,
          overhead_cost_sar: 50,
          total_cost_sar: null,
          has_fabric_price: false,
        },
      ],
    } satisfies SalesOrderCost;

    const salesOrder = {
      id: "so-1",
      so_number: "SO-2026-0117",
      client_code: "FR-0726-0037",
      fabric_lines: [
        {
          id: "line-jkt",
          label_count: 1,
          label_stickers: [{ code: "JKT", piece_name: "Jacket", sequence: 1 }],
        },
        {
          id: "line-tr",
          label_count: 1,
          label_stickers: [{ code: "TR", piece_name: "Trouser", sequence: 1 }],
        },
      ],
    } as SalesOrder;

    const worksheet = buildCostHintWorksheet({
      overview: overviewOf(orderCost),
      salesOrders: [salesOrder],
      invoices: [
        {
          invoice_number: "INV-2026-0015",
          invoice_date: "2026-09-07",
          lines: [
            {
              sales_order_line_id: "line-jkt",
              unit_price: 1190.02,
              quantity: 2,
            },
          ],
        } as CustomerInvoice,
      ],
      generatedAt: "2026-09-07T12:00:00.000Z",
    });

    assert.equal(worksheet.rows.length, 2);
    assert.equal(worksheet.rows[0]?.cost_hint_sar, 1190.02);
    assert.equal(worksheet.rows[0]?.fabric_cost_sar, 790.02);
    assert.equal(worksheet.rows[0]?.invoice_number, "INV-2026-0015");
    assert.equal(worksheet.rows[0]?.unit_price_sar, 1190.02);
    assert.equal(worksheet.rows[0]?.quantity, 2);
    assert.equal(worksheet.rows[1]?.missing_price, true);
    assert.equal(worksheet.rows[1]?.cost_hint_sar, null);
    assert.equal(worksheet.rows[0]?.fabric_brand, "Caccioppoli");
    assert.equal(worksheet.rows[0]?.supplier_id, "caccioppoli");
    assert.equal(worksheet.rows[0]?.composition, "65% wool");
    assert.equal(worksheet.rows[0]?.weight_gsm, 240);
    assert.equal(worksheet.rows[0]?.color, "light blu");
    assert.match(worksheet.subtitle, /Do not send to the client/);
  });

  it("builds an invoice worksheet from the editor cost-hint columns", () => {
    const worksheet = buildCostHintWorksheetFromInvoice({
      invoice: {
        invoice_number: "INV-2026-0015",
        so_number: "SO-2026-0117",
        client_name: "Ibrahim",
        client_code: "FR-0726-0037",
        lines: [
          {
            article_number: 3,
            garment_type: "Jacket",
            description: "Jacket",
            fabric_number: "360103",
            fabric_brand: "Caccioppoli",
            composition: "Cacci",
            weight_gsm: 240,
            quantity: 2,
            unit_price: 1190.02,
            fabric_cost_hint_sar: 790.02,
            cost_hint_sar: 1190.02,
            sales_order_line_id: "line-jkt",
          },
        ],
      } as CustomerInvoice,
      salesOrder: {
        id: "so-1",
        so_number: "SO-2026-0117",
        fabric_lines: [
          {
            id: "line-jkt",
            supplier_id: "caccioppoli",
            supplier_name: "Caccioppoli",
            fabric_number: "360103",
            composition: "65% wool 35% silk",
            weight_gsm: 240,
            color: "light blu",
          },
        ],
      } as SalesOrder,
    });
    assert.equal(worksheet.rows[0]?.article_label, "L03");
    assert.equal(worksheet.rows[0]?.cost_hint_sar, 1190.02);
    assert.equal(worksheet.rows[0]?.fabric_brand, "Caccioppoli");
    assert.equal(worksheet.rows[0]?.supplier_id, "caccioppoli");
    assert.equal(worksheet.rows[0]?.composition, "65% wool 35% silk");
    assert.equal(worksheet.rows[0]?.weight_gsm, 240);
    assert.equal(worksheet.rows[0]?.color, "light blu");
    assert.equal(formatCostHintComposition(worksheet.rows[0]?.composition), "65% Wool 35% Silk");
    assert.equal(worksheet.missing_price_count, 0);
  });

  it("prints fibre, gsm, and a mill swatch URL for the cost-hint worksheet", () => {
    assert.equal(formatCostHintComposition("65% wool 35% silk"), "65% Wool 35% Silk");
    assert.equal(formatCostHintComposition("Cacci"), "-");
    assert.equal(formatCostHintComposition(null), "-");
    assert.equal(formatCostHintWeight(240), "240 gsm");
    assert.equal(formatCostHintWeight(null), "-");
    assert.equal(costHintSwatchUrl("caccioppoli", "360103"), "/api/suppliers/caccioppoli/images/360103");
    assert.equal(costHintSwatchUrl(null, "360103"), null);
  });
});
