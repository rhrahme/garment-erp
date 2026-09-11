import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { salesOrderMatchesInvoiceClient } from "./invoice-client-match.ts";

describe("salesOrderMatchesInvoiceClient", () => {
  it("accepts the same client code when client_id drifted", () => {
    assert.equal(
      salesOrderMatchesInvoiceClient(
        { client_id: "client-khaled", client_code: "FR-0626-0037" },
        { client_id: "c-khaled-legacy", client_code: "FR-0626-0037" }
      ),
      true
    );
    assert.equal(
      salesOrderMatchesInvoiceClient(
        { client_id: "client-khaled", client_code: "" },
        { client_id: "client-khaled", client_code: "FR-0626-0037" }
      ),
      true
    );
  });

  it("still refuses another client", () => {
    assert.equal(
      salesOrderMatchesInvoiceClient(
        { client_id: "client-khaled", client_code: "FR-0626-0037" },
        { client_id: "client-moussa", client_code: "FR-0426-0007" }
      ),
      false
    );
  });
});
