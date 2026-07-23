import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getInvoiceAmountPaid,
  getInvoiceBalanceDue,
  normalizeInvoicePayments,
  roundInvoiceMoney,
} from "./payments.ts";

describe("invoice payments", () => {
  it("treats legacy paid invoices without a ledger as fully paid", () => {
    const row = { total: 1000, status: "paid" as const, payments: [] };
    assert.equal(getInvoiceAmountPaid(row), 1000);
    assert.equal(getInvoiceBalanceDue(row), 0);
  });

  it("computes balance due from deposits", () => {
    const row = {
      total: 1000,
      status: "sent" as const,
      payments: normalizeInvoicePayments([
        {
          id: "pay-1",
          amount: 250,
          paid_at: "2026-07-01",
          method: "cash",
          notes: "deposit",
          recorded_at: "2026-07-01T10:00:00.000Z",
          recorded_by: "sales1@hagan.pro",
        },
      ]),
    };
    assert.equal(getInvoiceAmountPaid(row), 250);
    assert.equal(getInvoiceBalanceDue(row), 750);
  });

  it("never returns a negative balance due", () => {
    const row = {
      total: 100,
      status: "sent" as const,
      payments: normalizeInvoicePayments([
        {
          id: "pay-2",
          amount: 150,
          paid_at: "2026-07-01",
          method: "transfer",
          notes: null,
          recorded_at: "2026-07-01T10:00:00.000Z",
          recorded_by: null,
        },
      ]),
    };
    assert.equal(getInvoiceAmountPaid(row), 150);
    assert.equal(getInvoiceBalanceDue(row), 0);
  });

  it("rounds money to 2 decimals", () => {
    assert.equal(roundInvoiceMoney(10.006), 10.01);
    assert.equal(roundInvoiceMoney(10.004), 10);
  });

  it("drops invalid payment rows", () => {
    const payments = normalizeInvoicePayments([
      {
        id: "bad",
        amount: 0,
        paid_at: "2026-07-01",
        method: null,
        notes: null,
        recorded_at: "2026-07-01T10:00:00.000Z",
        recorded_by: null,
      },
      {
        id: "good",
        amount: 50.5,
        paid_at: "2026-07-02",
        method: "card",
        notes: "ok",
        recorded_at: "2026-07-02T10:00:00.000Z",
        recorded_by: "admin",
      },
    ]);
    assert.equal(payments.length, 1);
    assert.equal(payments[0]!.amount, 50.5);
  });
});
