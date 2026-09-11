import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildInvoiceLinesFromSalesOrder,
  enrichInvoiceLinesWithFabricDetails,
} from "./build-invoice.ts";
import type { CustomerInvoiceLine } from "@/lib/types/customer-invoices";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

function fabricLine(
  overrides: Partial<SalesOrderFabricLine> & Pick<SalesOrderFabricLine, "id">
): SalesOrderFabricLine {
  return {
    garment_type: "Trouser",
    label_count: 1,
    label_stickers: [],
    supplier_id: "zegna",
    supplier_name: "Zegna",
    fabric_number: "50024",
    quantity: 1.4,
    unit: "meters",
    unit_price: 0,
    composition: null,
    weight_gsm: null,
    width_cm: null,
    width_inches: null,
    color: null,
    ...overrides,
  };
}

function order(lines: SalesOrderFabricLine[]): SalesOrder {
  return {
    id: "so-a",
    so_number: "SO-2026-0123",
    client_id: "client-khaled",
    client_code: "FR-0626-0037",
    client_name: "Pr Khaled Bin Salman",
    client_reference: null,
    order_date: "2026-06-01",
    delivery_date: null,
    delivery_destination: "RUH",
    status: "open",
    notes: null,
    fabric_lines: lines,
    fabric_po_ids: [],
  } as unknown as SalesOrder;
}

describe("fabric specs come from the mill price list", () => {
  it("replaces a stored composition that contradicts the catalog", () => {
    // A Loro Piana "SUMMERTIME" composition was found sitting on fabrics from
    // other mills entirely. While stored values won, no rebuild could clear it.
    const built = buildInvoiceLinesFromSalesOrder(
      order([
        fabricLine({
          id: "f1",
          composition: '71% WOOL 15% SILK 14% LINEN "SUMMERTIME"',
          weight_gsm: 250,
        }),
      ])
    );

    const line = built[0]!;
    assert.equal(line.weight_gsm, 260, "Zegna 50024 is 260 gsm, not the stored 250");
    assert.doesNotMatch(String(line.composition), /SUMMERTIME/);
    assert.match(String(line.composition), /71% Wool/);
  });

  it("still fills a blank line from the catalog", () => {
    const built = buildInvoiceLinesFromSalesOrder(order([fabricLine({ id: "f1" })]));

    assert.equal(built[0]!.weight_gsm, 260);
    assert.match(String(built[0]!.composition), /71% Wool/);
  });

  it("blanks a spec that no price list can confirm", () => {
    // 206202 is in none of the uploaded price lists. Whatever is stored against
    // it cannot be checked, so it does not get printed as though it could.
    const built = buildInvoiceLinesFromSalesOrder(
      order([
        fabricLine({
          id: "f1",
          supplier_id: "caccioppoli",
          supplier_name: "Caccioppoli",
          fabric_number: "206202",
          composition: '71% WOOL 15% SILK 14% LINEN "SUMMERTIME"',
          weight_gsm: 250,
        }),
      ])
    );

    assert.equal(built[0]!.composition, null);
    assert.equal(built[0]!.weight_gsm, null);
  });

  it("keeps the specs of a custom fabric, which has no mill price list", () => {
    const built = buildInvoiceLinesFromSalesOrder(
      order([
        fabricLine({
          id: "f1",
          supplier_id: "custom",
          supplier_name: "Custom",
          fabric_number: "CF-2026-0001",
          composition: "100% Cotton",
          weight_gsm: 185,
        }),
      ])
    );

    assert.equal(built[0]!.composition, "100% Cotton");
    assert.equal(built[0]!.weight_gsm, 185);
  });

  it("does not trade a stated composition for a vaguer catalog label", () => {
    // The Drapers list names fibres without their shares. "97% CO 3% EA" is the
    // better value of the two and has to survive the lookup.
    const built = buildInvoiceLinesFromSalesOrder(
      order([
        fabricLine({
          id: "f1",
          supplier_id: "drapers",
          supplier_name: "Drapers",
          fabric_number: "26101",
          composition: "97% CO 3% EA",
          weight_gsm: 210,
        }),
      ])
    );

    assert.equal(built[0]!.composition, "97% CO 3% EA");
    assert.equal(built[0]!.weight_gsm, 210);
  });

  it("corrects an already-stored invoice line when details are refreshed", () => {
    const lines: CustomerInvoiceLine[] = [
      {
        id: "l1",
        article_number: 1,
        sales_order_line_id: "f1",
        description: "Trouser",
        garment_type: "Trouser",
        piece_name: "Trouser",
        sticker_code: null,
        fabric_number: "50024",
        fabric_brand: "Zegna",
        composition: '71% WOOL 15% SILK 14% LINEN "SUMMERTIME"',
        weight_gsm: 250,
        quantity: 1,
        unit_price: 0,
        line_total: 0,
      } as CustomerInvoiceLine,
    ];

    const enriched = enrichInvoiceLinesWithFabricDetails(
      lines,
      order([fabricLine({ id: "f1" })])
    );

    assert.equal(enriched[0]!.weight_gsm, 260);
    assert.doesNotMatch(String(enriched[0]!.composition), /SUMMERTIME/);
  });

  it("takes no spec from a fabric line matched only on garment type", () => {
    // The invoice line is a Caccioppoli shirting; the only fabric line that
    // matches it is a Loro Piana one with the same garment. Reading a mill off
    // that line is how one cloth's composition ends up on another's.
    const lines: CustomerInvoiceLine[] = [
      {
        id: "l1",
        article_number: 1,
        sales_order_line_id: null,
        description: "Shirt SS",
        garment_type: "Trouser",
        piece_name: null,
        sticker_code: null,
        fabric_number: "206202",
        fabric_brand: "Caccioppoli",
        composition: null,
        weight_gsm: null,
        quantity: 1,
        unit_price: 0,
        line_total: 0,
      } as CustomerInvoiceLine,
    ];

    const enriched = enrichInvoiceLinesWithFabricDetails(
      lines,
      order([
        fabricLine({
          id: "f1",
          supplier_id: "loro-piana",
          supplier_name: "Loro Piana",
          fabric_number: "771001",
          garment_type: "Trouser",
        }),
      ])
    );

    assert.equal(enriched[0]!.fabric_number, "206202");
    assert.equal(enriched[0]!.composition, null);
    assert.equal(enriched[0]!.weight_gsm, null);
  });

  it("blanks an unconfirmable spec already sitting on a stored invoice line", () => {
    const lines: CustomerInvoiceLine[] = [
      {
        id: "l1",
        article_number: 1,
        sales_order_line_id: "f1",
        description: "Shirt SS",
        garment_type: "Shirt SS",
        piece_name: "Shirt SS",
        sticker_code: null,
        fabric_number: "206202",
        fabric_brand: "Caccioppoli",
        composition: '71% WOOL 15% SILK 14% LINEN "SUMMERTIME"',
        weight_gsm: 250,
        quantity: 1,
        unit_price: 0,
        line_total: 0,
      } as CustomerInvoiceLine,
    ];

    const enriched = enrichInvoiceLinesWithFabricDetails(
      lines,
      order([
        fabricLine({
          id: "f1",
          supplier_id: "caccioppoli",
          supplier_name: "Caccioppoli",
          fabric_number: "206202",
        }),
      ])
    );

    assert.equal(enriched[0]!.composition, null);
    assert.equal(enriched[0]!.weight_gsm, null);
  });
});
