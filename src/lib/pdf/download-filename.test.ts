import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildBaseSizeSheetPdfFilename,
  buildCustomerInvoicePdfFilename,
  buildDownloadFilename,
  buildEmployeeBadgePdfFilename,
  buildSalesOrderPdfFilename,
  buildStickerDownloadFilename,
  contentDisposition,
  parseContentDispositionFilename,
  slugPdfToken,
} from "./download-filename.ts";

describe("slugPdfToken", () => {
  it("strips unsafe characters", () => {
    assert.equal(slugPdfToken("Youssef Al Rashed"), "Youssef-Al-Rashed");
    assert.equal(slugPdfToken("SO/2026:0002"), "SO-2026-0002");
    // Accented e via unicode escape (keep source ASCII-only).
    assert.equal(slugPdfToken("caf\u00e9"), "cafe");
  });
});

describe("buildDownloadFilename", () => {
  it("joins tokens and adds extension", () => {
    assert.equal(buildDownloadFilename(["SO-2026-0002", "Client Name"]), "SO-2026-0002-Client-Name.pdf");
  });
});

describe("parseContentDispositionFilename", () => {
  it("reads quoted filename", () => {
    assert.equal(
      parseContentDispositionFilename('attachment; filename="INV-2026-0007-Client.pdf"'),
      "INV-2026-0007-Client.pdf"
    );
  });

  it("reads filename*", () => {
    assert.equal(
      parseContentDispositionFilename("attachment; filename*=UTF-8''SO-2026-0002.pdf"),
      "SO-2026-0002.pdf"
    );
  });
});

describe("contentDisposition", () => {
  it("builds attachment header", () => {
    assert.equal(
      contentDisposition("SO-2026-0002.pdf"),
      'attachment; filename="SO-2026-0002.pdf"'
    );
  });
});

describe("buildSalesOrderPdfFilename", () => {
  it("includes SO, client code/name, and article", () => {
    assert.equal(
      buildSalesOrderPdfFilename({
        so_number: "SO-2026-0002",
        client_code: "FR-0526-0002",
        client_name: "Youssef Al Rashed",
        product_article: "Linen Short",
      }),
      "SO-2026-0002-FR-0526-0002-Youssef-Al-Rashed-Linen-Short.pdf"
    );
  });
});

describe("buildBaseSizeSheetPdfFilename", () => {
  it("uses brand, garment, cut, and size", () => {
    assert.equal(
      buildBaseSizeSheetPdfFilename(
        {
          house_brand_code: "FR",
          garment_type: "shorts",
          cut_family: "Suit Supply",
          cut_variant: "Regular",
          id: "bp-uuid",
        },
        "M"
      ),
      "FR-shorts-Suit-Supply-Regular-size-M.pdf"
    );
  });
});

describe("buildCustomerInvoicePdfFilename", () => {
  it("keeps INV number and adds client (no double INV prefix)", () => {
    assert.equal(
      buildCustomerInvoicePdfFilename({
        invoiceNumber: "INV-2026-0007",
        clientName: "Youssef Al Rashed",
        kind: "invoice",
      }),
      "INV-2026-0007-Youssef-Al-Rashed.pdf"
    );
  });

  it("prefixes QUOTE without duplicating invoice number", () => {
    assert.equal(
      buildCustomerInvoicePdfFilename({
        invoiceNumber: "INV-2026-0007",
        clientName: "Youssef Al Rashed",
        kind: "quote",
      }),
      "QUOTE-INV-2026-0007-Youssef-Al-Rashed.pdf"
    );
  });
});

describe("buildStickerDownloadFilename", () => {
  it("builds SO + client + sheet suffix", () => {
    assert.equal(
      buildStickerDownloadFilename({
        soNumber: "SO-2026-0002",
        clientName: "Youssef Al Rashed",
        sheet: "pieces",
        ext: "pdf",
      }),
      "SO-2026-0002-Youssef-Al-Rashed-stickers-prod.pdf"
    );
  });
});

describe("buildEmployeeBadgePdfFilename", () => {
  it("includes group and optional selection count", () => {
    assert.equal(
      buildEmployeeBadgePdfFilename({ groupSlug: "expats" }),
      "employee-badges-expats.pdf"
    );
    assert.equal(
      buildEmployeeBadgePdfFilename({ groupSlug: "expats", selectedCount: 3 }),
      "employee-badges-expats-3.pdf"
    );
  });
});
