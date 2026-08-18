import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canRevealInvoiceAmountsWithoutPassword,
  canToggleInvoiceAmounts,
  canViewInvoiceAmountsAlways,
  canViewMoney,
  invoiceAmountsVisibleByDefault,
} from "./invoice-amounts-access.ts";

describe("canViewMoney", () => {
  it("is admin only", () => {
    assert.equal(canViewMoney({ isAdmin: true }), true);
    assert.equal(canViewMoney({ isAdmin: false }), false);
  });

  it("gates every invoice-amount helper", () => {
    const admin = { isAdmin: true };
    const other = { isAdmin: false };
    assert.equal(canViewInvoiceAmountsAlways(admin), true);
    assert.equal(canToggleInvoiceAmounts(admin), true);
    assert.equal(canRevealInvoiceAmountsWithoutPassword(admin), true);
    assert.equal(canViewInvoiceAmountsAlways(other), false);
    assert.equal(canToggleInvoiceAmounts(other), false);
    assert.equal(canRevealInvoiceAmountsWithoutPassword(other), false);
    assert.equal(invoiceAmountsVisibleByDefault(admin), false);
  });
});
