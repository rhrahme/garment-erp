import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hrefForNamedClientInvoices, invoicesForNamedClient } from "./named-client-invoice.ts";

describe("hrefForNamedClientInvoices", () => {
  it("opens the only Pr Khaled invoice and ignores Khaled Al Moussa", () => {
    const invoices = [
      { id: "inv-moussa", client_name: "Khaled Al Moussa", client_code: "FR-0426-0007" },
      { id: "inv-khaled", client_name: "Pr Khaled Bin Salman", client_code: "FR-0626-0037" },
    ];
    assert.deepEqual(invoicesForNamedClient(invoices, "khaled").map((row) => row.id), ["inv-khaled"]);
    assert.equal(hrefForNamedClientInvoices(invoices, "khaled", "Khaled"), "/invoices/inv-khaled");
  });

  it("stays on the Invoicing list when Pr Khaled still has several drafts", () => {
    const invoices = [
      { id: "inv-a", client_name: "Pr Khaled Bin Salman", client_code: "FR-0626-0037" },
      { id: "inv-b", client_name: "Pr Khaled Bin Salman", client_code: "FR-0626-0037" },
    ];
    assert.equal(hrefForNamedClientInvoices(invoices, "khaled", "Khaled"), "/invoices?q=Khaled");
    assert.equal(hrefForNamedClientInvoices([], "khaled", "Khaled"), "/invoices?q=Khaled");
  });
});
