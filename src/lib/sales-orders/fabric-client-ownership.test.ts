import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatFabricClientOwnership,
  ownershipFromFabricLine,
} from "./fabric-client-ownership.ts";

describe("formatFabricClientOwnership", () => {
  it("shows the current client when there is no transfer", () => {
    assert.equal(
      formatFabricClientOwnership({ currentClientName: "Pr Khaled" }),
      "Pr Khaled"
    );
  });

  it("shows who the fabric came from after a client-to-client transfer", () => {
    assert.equal(
      formatFabricClientOwnership({
        currentClientName: "Abdel Aziz Fahd Al Ajlan",
        sourceClientName: "Ralph Rahme",
      }),
      "Abdel Aziz Fahd Al Ajlan (from Ralph Rahme)"
    );
  });

  it("shows who received the fabric on a replacement reorder", () => {
    assert.equal(
      formatFabricClientOwnership({
        currentClientName: "Ralph Rahme",
        destinationClientName: "Abdelaziz Ajlan Al Ajlan",
      }),
      "Ralph Rahme -> Abdelaziz Ajlan Al Ajlan"
    );
  });
});

describe("ownershipFromFabricLine", () => {
  it("reads inbound and replacement transfer names from the line", () => {
    const inbound = ownershipFromFabricLine(
      { client_name: "Client B" },
      {
        transfer_inbound: {
          transfer_id: "t1",
          source_so_number: "SO-1",
          source_client_name: "Client A",
          source_line_id: "l1",
          original_sticker_codes: [],
          meters: 2,
        },
      }
    );
    assert.equal(inbound.source_client_name, "Client A");
    assert.equal(
      formatFabricClientOwnership({
        currentClientName: inbound.current_client_name,
        sourceClientName: inbound.source_client_name,
      }),
      "Client B (from Client A)"
    );
  });
});
