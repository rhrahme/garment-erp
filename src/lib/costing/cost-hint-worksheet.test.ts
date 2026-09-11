import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  articleCountForCostLine,
  articleLabelFromNumber,
  applyCostHintMissingPriceCopy,
  buildCostHintWorksheet,
  buildCostHintWorksheetFromInvoice,
  combineCostHintRowsByGarmentFibreWeight,
  costHintInvoiceGroupKey,
  costHintPrimaryFabricNumber,
  costHintGarmentFamily,
  costHintMissingPriceFilename,
  costHintNamedClientPackFiles,
  costHintSwatchUrl,
  costHintWorksheetFilename,
  formatCostHintArticleSummary,
  formatCostHintComposition,
  formatCostHintSalesOrderScope,
  formatCostHintWeight,
  pieceCountForFabricLine,
  summarizeCostHintArticles,
  uniqueCostHintSoNumbers,
  unitCostFromLineTotal,
  type CostHintWorksheetRow,
} from "@/lib/costing/cost-hint-worksheet";
import { matchesCostHintClientFilter } from "@/lib/costing/cost-hint-clients";
import type { CostingOverview, SalesOrderCost } from "@/lib/costing/compute";
import { readSalesOrders } from "@/lib/data/sales-orders";
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
    assert.equal(worksheet.rows[0]?.article_count, 2);
    assert.equal(worksheet.rows[1]?.article_count, 1);
    assert.equal(
      formatCostHintArticleSummary(summarizeCostHintArticles(worksheet.rows)),
      "2 Jackets, 1 Trouser. Total: 3 pcs"
    );
    assert.match(worksheet.subtitle, /Do not send to the client/);

    const ibrahimOnly = buildCostHintWorksheet({
      overview: overviewOf(orderCost),
      salesOrders: [salesOrder],
      invoices: [],
      clientTokens: ["ibrahim"],
      generatedAt: "2026-09-07T12:00:00.000Z",
    });
    assert.equal(ibrahimOnly.rows.length, 2);
    const otherClient = buildCostHintWorksheet({
      overview: overviewOf(orderCost),
      salesOrders: [salesOrder],
      invoices: [],
      clientTokens: ["hicham"],
      generatedAt: "2026-09-07T12:00:00.000Z",
    });
    assert.equal(otherClient.rows.length, 0);
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
    assert.equal(worksheet.rows[0]?.article_count, 2);
    assert.equal(
      formatCostHintArticleSummary(summarizeCostHintArticles(worksheet.rows)),
      "2 Jackets. Total: 2 pcs"
    );
    assert.equal(worksheet.missing_price_count, 0);
  });

  it("combines invoice hint rows with the same garment, fibre, and gsm", () => {
    const combinedInvoiceHint = buildCostHintWorksheetFromInvoice({
      invoice: {
        invoice_number: "INV-2026-0020",
        so_number: "SO-2026-0133",
        client_name: "Pr Khaled Bin Salman",
        client_code: "FR-0626-0037",
        lines: [
          {
            article_number: 1,
            garment_type: "Shirt LS",
            description: "Shirt LS",
            fabric_number: "771001",
            composition: "100% linen",
            weight_gsm: 180,
            quantity: 1,
            unit_price: 0,
            cost_hint_sar: null,
          },
          {
            article_number: 2,
            garment_type: "Shirt LS",
            description: "Shirt LS",
            fabric_number: "771002",
            composition: "100% LI",
            weight_gsm: 180,
            quantity: 1,
            unit_price: 0,
            cost_hint_sar: null,
          },
          {
            article_number: 3,
            garment_type: "Shirt LS",
            description: "Shirt LS",
            fabric_number: "771099",
            composition: "100% linen",
            weight_gsm: 210,
            quantity: 1,
            unit_price: 0,
            cost_hint_sar: null,
          },
        ],
      } as CustomerInvoice,
    });
    assert.equal(combinedInvoiceHint.rows.length, 2);
    const linen180 = combinedInvoiceHint.rows.find((row) => row.weight_gsm === 180);
    assert.ok(linen180);
    assert.equal(linen180.quantity, 2);
    assert.equal(linen180.article_count, 2);
    assert.match(linen180.fabric_number, /771001/);
    assert.match(linen180.fabric_number, /771002/);
    assert.equal(
      formatCostHintArticleSummary(summarizeCostHintArticles(combinedInvoiceHint.rows)),
      "3 Shirts. Total: 3 pcs"
    );
  });

  it("keeps different mills, different fabric costs, and unknown fabrics apart", () => {
    const line = (over: Record<string, unknown>) => ({
      garment_type: "Trouser",
      description: "Trouser",
      composition: "71% wool 15% silk 14% linen",
      weight_gsm: 250,
      quantity: 1,
      unit_price: 0,
      cost_hint_sar: 200,
      fabric_cost_hint_sar: 100,
      ...over,
    });
    const worksheet = buildCostHintWorksheetFromInvoice({
      invoice: {
        invoice_number: "INV-2026-0018",
        so_number: "SO-2026-0131, SO-2026-0123",
        client_name: "Pr Khaled Bin Salman",
        client_code: "FR-0626-0037",
        lines: [
          line({ article_number: 1, fabric_number: "771018", fabric_brand: "Loro Piana" }),
          line({ article_number: 2, fabric_number: "771019", fabric_brand: "Loro Piana" }),
          line({ article_number: 3, fabric_number: "64013", fabric_brand: "Zegna" }),
          line({ article_number: 4, fabric_number: "BEY 008", fabric_brand: "Canclini" }),
          line({ article_number: 5, fabric_number: "771020", fabric_brand: "Loro Piana", fabric_cost_hint_sar: 999 }),
          line({ article_number: 6, fabric_number: "Stock", fabric_brand: "Canclini", composition: null, weight_gsm: null }),
        ],
      } as unknown as CustomerInvoice,
    });

    // Only the two Loro Piana rows that match on everything collapse.
    assert.equal(worksheet.rows.length, 5);
    const merged = worksheet.rows.find((row) => row.quantity === 2);
    assert.ok(merged);
    assert.equal(merged.fabric_brand, "Loro Piana");
    assert.match(merged.fabric_number, /771018/);
    assert.match(merged.fabric_number, /771019/);

    for (const row of worksheet.rows) {
      assert.ok(!row.fabric_brand?.includes(","), `mills merged: ${row.fabric_brand}`);
    }
    const dearer = worksheet.rows.find((row) => row.fabric_cost_sar === 999);
    assert.ok(dearer, "a different fabric cost keeps its own row");
    assert.equal(dearer.quantity, 1);
    const unknown = worksheet.rows.find((row) => row.fabric_number === "Stock");
    assert.ok(unknown, "no composition or weight means no merging");
    assert.equal(unknown.quantity, 1);
  });

  it("reads fabric details from every order a combined invoice covers", () => {
    const order = (id: string, so: string, fabricNumber: string, supplier: string) => ({
      id,
      so_number: so,
      fabric_lines: [
        {
          id: `${id}-l1`,
          fabric_number: fabricNumber,
          supplier_id: supplier,
          supplier_name: supplier === "zegna" ? "Zegna" : "Loro Piana",
          composition: "71% wool 15% silk 14% linen",
          weight_gsm: 250,
          garment_type: "Trouser",
        },
      ],
    });
    const worksheet = buildCostHintWorksheetFromInvoice({
      invoice: {
        invoice_number: "INV-2026-0018",
        so_number: "SO-2026-0131, SO-2026-0123",
        client_name: "Pr Khaled Bin Salman",
        client_code: "FR-0626-0037",
        lines: [
          { article_number: 1, garment_type: "Trouser", description: "Trouser", sales_order_line_id: "o1-l1", quantity: 1, unit_price: 0, cost_hint_sar: 200 },
          { article_number: 2, garment_type: "Trouser", description: "Trouser", sales_order_line_id: "o2-l1", quantity: 1, unit_price: 0, cost_hint_sar: 200 },
        ],
      } as unknown as CustomerInvoice,
      salesOrders: [
        order("o1", "SO-2026-0131", "771018", "loro-piana"),
        order("o2", "SO-2026-0123", "64013", "zegna"),
      ] as never,
    });

    // The second order used to be invisible, leaving its mill blank.
    assert.equal(worksheet.rows.length, 2);
    const mills = worksheet.rows.map((row) => row.fabric_brand).sort();
    assert.deepEqual(mills, ["Loro Piana", "Zegna"]);
  });

  it("combines mill collection names that share fibre and gsm", () => {
    const worksheet = buildCostHintWorksheetFromInvoice({
      invoice: {
        invoice_number: "INV-2026-0021",
        so_number: "SO-2026-0116",
        client_name: "Pr Khaled Bin Salman",
        client_code: "FR-0626-0037",
        lines: [
          {
            article_number: 1,
            garment_type: "Shirt LS",
            description: "Shirt LS",
            fabric_number: "SL-1",
            composition: "STREET LINO ALOE NEW 100% LINEN",
            weight_gsm: 195,
            quantity: 1,
            unit_price: 0,
            cost_hint_sar: null,
          },
          {
            article_number: 2,
            garment_type: "Shirt LS",
            description: "Shirt LS",
            fabric_number: "SL-2",
            composition: "STREET LINO DELAVE' ALOE NEW 100% LINEN",
            weight_gsm: 195,
            quantity: 1,
            unit_price: 0,
            cost_hint_sar: null,
          },
          {
            article_number: 3,
            garment_type: "Short",
            description: "Short",
            fabric_number: "ZEFIRO",
            composition: "ZEFIRO 100% COTTON",
            weight_gsm: 240,
            quantity: 1,
            unit_price: 0,
            cost_hint_sar: null,
          },
        ],
      } as CustomerInvoice,
    });
    assert.equal(worksheet.rows.length, 2);
    const shirts = worksheet.rows.find((row) => row.garment === "Shirt LS");
    assert.ok(shirts);
    assert.equal(shirts.quantity, 2);
    assert.equal(formatCostHintComposition(shirts.composition), "100% Linen");
  });

  it("combines hint rows with the same garment, fibre, and gsm on one sales order", () => {
    const worksheet = buildCostHintWorksheet({
      overview: overviewOf({
        order_id: "so-khaled",
        so_number: "SO-2026-0133",
        client_name: "Pr Khaled Bin Salman",
        client_code: "FR-0626-0037",
        client_reference: null,
        product_article: null,
        order_date: "2026-07-30",
        status: "fabric_pos_created",
        is_archived: false,
        line_count: 3,
        lines_missing_price: 3,
        fabric_base_sar: 0,
        customs_duty_sar: 0,
        import_vat_sar: 0,
        vat_recoverable_sar: 0,
        fabric_cash_outlay_sar: 0,
        fabric_cost_sar: 0,
        labor_cost_sar: 0,
        washing_cost_sar: 0,
        overhead_cost_sar: 0,
        total_cost_sar: 0,
        lines: [
          {
            line_id: "s1",
            article_number: 1,
            fabric_number: "771001",
            supplier_id: "loro-piana",
            supplier_name: "Loro Piana",
            garment_type: "Shirt LS",
            composition: "100% linen",
            weight_gsm: 180,
            width_label: null,
            color: "white",
            meters: 1.5,
            unit: "meters",
            unit_price: null,
            supplier_line_total: null,
            fabric_base_sar: null,
            customs_duty_sar: 0,
            import_vat_sar: 0,
            vat_recoverable_sar: 0,
            fabric_cash_outlay_sar: null,
            fabric_cost_sar: null,
            labor_cost_sar: 80,
            washing_cost_sar: 10,
            overhead_cost_sar: 10,
            total_cost_sar: null,
            has_fabric_price: false,
          },
          {
            line_id: "s2",
            article_number: 2,
            fabric_number: "771002",
            supplier_id: "loro-piana",
            supplier_name: "Loro Piana",
            garment_type: "Shirt LS",
            composition: "100% LI",
            weight_gsm: 180,
            width_label: null,
            color: "cream",
            meters: 1.5,
            unit: "meters",
            unit_price: null,
            supplier_line_total: null,
            fabric_base_sar: null,
            customs_duty_sar: 0,
            import_vat_sar: 0,
            vat_recoverable_sar: 0,
            fabric_cash_outlay_sar: null,
            fabric_cost_sar: null,
            labor_cost_sar: 80,
            washing_cost_sar: 10,
            overhead_cost_sar: 10,
            total_cost_sar: null,
            has_fabric_price: false,
          },
          {
            line_id: "s3",
            article_number: 3,
            fabric_number: "50024",
            supplier_id: "zegna",
            supplier_name: "Zegna",
            garment_type: "Trouser",
            composition: null,
            weight_gsm: null,
            width_label: null,
            color: null,
            meters: 1.2,
            unit: "meters",
            unit_price: null,
            supplier_line_total: null,
            fabric_base_sar: null,
            customs_duty_sar: 0,
            import_vat_sar: 0,
            vat_recoverable_sar: 0,
            fabric_cash_outlay_sar: null,
            fabric_cost_sar: null,
            labor_cost_sar: 80,
            washing_cost_sar: 10,
            overhead_cost_sar: 10,
            total_cost_sar: null,
            has_fabric_price: false,
          },
        ],
      }),
      salesOrders: [],
      invoices: [],
      clientTokens: ["khaled"],
      generatedAt: "2026-09-11T12:00:00.000Z",
    });
    assert.equal(worksheet.rows.length, 2);
    const shirts = worksheet.rows.find((row) => row.garment === "Shirt LS");
    assert.ok(shirts);
    assert.equal(shirts.quantity, 2);
    assert.equal(shirts.article_count, 2);
    assert.equal(costHintPrimaryFabricNumber(shirts.fabric_number), "771001");
    assert.equal(
      costHintInvoiceGroupKey({
        so_number: "SO-2026-0133",
        garment: "Shirt LS",
        composition: "100% linen",
        weight_gsm: 180,
      }),
      costHintInvoiceGroupKey({
        so_number: "SO-2026-0133",
        garment: "Shirt LS",
        composition: "100% LI",
        weight_gsm: 180,
      })
    );
    assert.equal(
      combineCostHintRowsByGarmentFibreWeight(worksheet.rows).length,
      2
    );
    assert.equal(
      formatCostHintArticleSummary(summarizeCostHintArticles(worksheet.rows)),
      "2 Shirts, 1 Trouser. Total: 3 pcs"
    );
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

  it("resumes shirts, overshirts, and suits as article counts", () => {
    assert.equal(costHintGarmentFamily("Shirt LS"), "Shirt");
    assert.equal(costHintGarmentFamily("Shirt SS"), "Shirt");
    assert.equal(costHintGarmentFamily("Overshirt"), "Overshirt");
    assert.equal(costHintGarmentFamily("Suit (Jacket + Trouser)"), "Suit");
    assert.equal(articleCountForCostLine({ garmentType: "Suit", pieces: 2 }), 1);
    assert.equal(articleCountForCostLine({ garmentType: "Shirt LS", pieces: 1 }), 1);
    assert.equal(
      formatCostHintArticleSummary(
        summarizeCostHintArticles([
          { garment: "Shirt LS", article_count: 10 },
          { garment: "Shirt SS", article_count: 0 },
          { garment: "Overshirt", article_count: 8 },
          { garment: "Suit", article_count: 2 },
        ] as CostHintWorksheetRow[])
      ),
      "10 Shirts, 8 Overshirts, 2 Jackets, 2 Trousers. Total: 22 pcs"
    );
  });

  it("expands Shirt+Trouser+Short into 15 pcs, 5 of each", () => {
    assert.equal(
      formatCostHintArticleSummary(
        summarizeCostHintArticles([
          { garment: "Shirt+Trouser+Short", article_count: 1 },
          { garment: "Shirt+Trouser+Short", article_count: 1 },
          { garment: "Shirt+Trouser+Short", article_count: 1 },
          { garment: "Shirt+Trouser+Short", article_count: 1 },
          { garment: "Shirt+Trouser+Short", article_count: 1 },
        ] as CostHintWorksheetRow[])
      ),
      "5 Shirts, 5 Trousers, 5 Shorts. 5 of each. Total: 15 pcs"
    );
  });

  it("expands every combo set on invoice and sitewide worksheets", () => {
    assert.equal(
      formatCostHintArticleSummary(
        summarizeCostHintArticles([
          { garment: "Shirt+Trouser", article_count: 3 },
          { garment: "Shirt+Short", article_count: 2 },
          { garment: "Overshirt+Trouser", article_count: 4 },
          { garment: "Suit", article_count: 1 },
          { garment: "Suit+Vest", article_count: 1 },
        ] as CostHintWorksheetRow[])
      ),
      "5 Shirts, 4 Overshirts, 2 Jackets, 9 Trousers, 2 Shorts, 1 Vest. Total: 23 pcs"
    );

    const invoiceWorksheet = buildCostHintWorksheetFromInvoice({
      invoice: {
        invoice_number: "INV-2026-0017",
        so_number: "SO-2026-0138",
        client_name: "Hicham",
        client_code: "FR-0726-0001",
        lines: [1, 2, 3, 4, 5].map((article) => ({
          article_number: article,
          garment_type: "Shirt+Trouser+Short",
          description: "Shirt + Trouser + Short",
          piece_name: "Shirt + Trouser + Short",
          quantity: 1,
          unit_price: 0,
          fabric_cost_hint_sar: null,
          cost_hint_sar: null,
        })),
      } as CustomerInvoice,
    });
    assert.equal(
      invoiceWorksheet.article_summary,
      "5 Shirts, 5 Trousers, 5 Shorts. 5 of each. Total: 15 pcs"
    );
  });

  it("keeps all seven Pr Khaled sales orders on one named sheet, including archived", () => {
    const khaledSos = [
      "SO-2026-0111",
      "SO-2026-0113",
      "SO-2026-0116",
      "SO-2026-0121",
      "SO-2026-0123",
      "SO-2026-0131",
      "SO-2026-0133",
    ];
    const orders = khaledSos.map((soNumber, index) => {
      const lineId = `line-${soNumber}`;
      return {
        order_id: soNumber,
        so_number: soNumber,
        client_name: "Pr Khaled Bin Salman",
        client_code: "FR-0626-0037",
        client_reference: null,
        product_article: null,
        order_date: "2026-06-30",
        status: "fabric_pos_created",
        is_archived: index < 6,
        line_count: 1,
        lines_missing_price: 0,
        fabric_base_sar: 100,
        customs_duty_sar: 5,
        import_vat_sar: 0,
        vat_recoverable_sar: 0,
        fabric_cash_outlay_sar: 0,
        fabric_cost_sar: 105,
        labor_cost_sar: 80,
        washing_cost_sar: 10,
        overhead_cost_sar: 10,
        total_cost_sar: 205,
        lines: [
          {
            line_id: lineId,
            article_number: 1,
            fabric_number: "360103",
            supplier_id: "caccioppoli",
            supplier_name: "Caccioppoli",
            garment_type: "Jacket",
            composition: "100% wool",
            weight_gsm: 240,
            width_label: "150 cm",
            color: "navy",
            meters: 1.9,
            unit: "meters",
            unit_price: 88,
            supplier_line_total: 167.2,
            fabric_base_sar: 100,
            customs_duty_sar: 5,
            import_vat_sar: 0,
            vat_recoverable_sar: 0,
            fabric_cash_outlay_sar: 0,
            fabric_cost_sar: 105,
            labor_cost_sar: 80,
            washing_cost_sar: 10,
            overhead_cost_sar: 10,
            total_cost_sar: 205,
            has_fabric_price: true,
          },
        ],
      } satisfies SalesOrderCost;
    });

    const worksheet = buildCostHintWorksheet({
      overview: {
        currency: "SAR",
        order_count: orders.length,
        line_count: orders.length,
        lines_missing_price: 0,
        fabric_base_sar: 700,
        customs_duty_sar: 35,
        import_vat_sar: 0,
        vat_recoverable_sar: 0,
        fabric_cash_outlay_sar: 0,
        fabric_cost_sar: 735,
        labor_cost_sar: 560,
        washing_cost_sar: 70,
        overhead_cost_sar: 70,
        total_cost_sar: 1435,
        orders,
      },
      salesOrders: [],
      invoices: [],
      includeArchived: false,
      clientTokens: ["khaled"],
      generatedAt: "2026-09-08T12:00:00.000Z",
    });

    assert.deepEqual(uniqueCostHintSoNumbers(worksheet.rows), khaledSos);
    assert.equal(worksheet.rows.length, 7);
    assert.match(worksheet.title, /7 sales orders/);
    assert.match(worksheet.subtitle, /SO-2026-0111/);
    assert.match(worksheet.subtitle, /SO-2026-0133/);
    assert.equal(
      formatCostHintSalesOrderScope(worksheet.rows),
      "7 sales orders | SO-2026-0111 | SO-2026-0113 | SO-2026-0116 | SO-2026-0121 | SO-2026-0123 | SO-2026-0131 | SO-2026-0133"
    );
    assert.equal(costHintWorksheetFilename(worksheet), "cost-hints-Pr-Khaled-Bin-Salman-7-orders.pdf");

    const packFiles = costHintNamedClientPackFiles(worksheet, "Pr Khaled Bin Salman");
    assert.equal(packFiles.length, 8);
    assert.equal(packFiles[0]?.name, "cost-hints-Pr-Khaled-Bin-Salman-7-orders.pdf");
    assert.deepEqual(
      packFiles.slice(1).map((file) => file.name),
      khaledSos.map((so) => `cost-hints-Pr-Khaled-Bin-Salman-${so}.pdf`)
    );
    assert.equal(uniqueCostHintSoNumbers(packFiles[1]?.worksheet.rows ?? []).join(), "SO-2026-0111");
  });

  it("builds a missing-fabric-price sheet and pack file from those lines only", () => {
    const worksheet = buildCostHintWorksheet({
      overview: overviewOf({
        order_id: "so-1",
        so_number: "SO-2026-0111",
        client_name: "Pr Khaled Bin Salman",
        client_code: "FR-0626-0037",
        client_reference: null,
        product_article: null,
        order_date: "2026-06-30",
        status: "fabric_pos_created",
        is_archived: false,
        line_count: 2,
        lines_missing_price: 1,
        fabric_base_sar: 100,
        customs_duty_sar: 5,
        import_vat_sar: 0,
        vat_recoverable_sar: 0,
        fabric_cash_outlay_sar: 0,
        fabric_cost_sar: 105,
        labor_cost_sar: 80,
        washing_cost_sar: 10,
        overhead_cost_sar: 10,
        total_cost_sar: 205,
        lines: [
          {
            line_id: "priced",
            article_number: 1,
            fabric_number: "771001",
            supplier_id: "loro-piana",
            supplier_name: "Loro Piana",
            garment_type: "Jacket",
            composition: "100% wool",
            weight_gsm: 240,
            width_label: null,
            color: null,
            meters: 1,
            unit: "meters",
            unit_price: 88,
            supplier_line_total: 88,
            fabric_base_sar: 100,
            customs_duty_sar: 5,
            import_vat_sar: 0,
            vat_recoverable_sar: 0,
            fabric_cash_outlay_sar: 0,
            fabric_cost_sar: 105,
            labor_cost_sar: 80,
            washing_cost_sar: 10,
            overhead_cost_sar: 10,
            total_cost_sar: 205,
            has_fabric_price: true,
          },
          {
            line_id: "blank",
            article_number: 2,
            fabric_number: "50024",
            supplier_id: "zegna",
            supplier_name: "Zegna",
            garment_type: "Trouser",
            composition: null,
            weight_gsm: null,
            width_label: null,
            color: null,
            meters: 1,
            unit: "meters",
            unit_price: null,
            supplier_line_total: null,
            fabric_base_sar: null,
            customs_duty_sar: 0,
            import_vat_sar: 0,
            vat_recoverable_sar: 0,
            fabric_cash_outlay_sar: null,
            fabric_cost_sar: null,
            labor_cost_sar: 80,
            washing_cost_sar: 10,
            overhead_cost_sar: 10,
            total_cost_sar: null,
            has_fabric_price: false,
          },
        ],
      }),
      salesOrders: [],
      invoices: [],
      clientTokens: ["khaled"],
      generatedAt: "2026-09-08T12:00:00.000Z",
    });
    const missing = applyCostHintMissingPriceCopy(worksheet, "Pr Khaled Bin Salman");
    assert.equal(missing.rows.length, 1);
    assert.equal(missing.rows[0]?.fabric_number, "50024");
    assert.match(missing.title, /1 line missing fabric price/);
    assert.match(missing.subtitle, /1 Zegna/);
    assert.equal(
      costHintMissingPriceFilename("Pr Khaled Bin Salman", 1),
      "cost-hints-Pr-Khaled-Bin-Salman-1-missing-fabric-price.pdf"
    );
    const packNames = costHintNamedClientPackFiles(worksheet, "Pr Khaled Bin Salman").map(
      (file) => file.name
    );
    assert.equal(packNames.includes("cost-hints-Pr-Khaled-Bin-Salman-1-missing-fabric-price.pdf"), true);
  });

  it("lists the seven Pr Khaled sales orders in the house dump", () => {
    const sos = [
      ...new Set(
        readSalesOrders()
          .orders.filter((order) =>
            matchesCostHintClientFilter(order.client_name, order.client_code, ["khaled"])
          )
          .map((order) => order.so_number)
      ),
    ].sort((a, b) => a.localeCompare(b));
    assert.deepEqual(sos, [
      "SO-2026-0111",
      "SO-2026-0113",
      "SO-2026-0116",
      "SO-2026-0121",
      "SO-2026-0123",
      "SO-2026-0131",
      "SO-2026-0133",
    ]);
  });
});
