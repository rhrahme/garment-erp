import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  isPieceQrPrintTeam,
  parseSalesOrderPrintTeam,
  SALES_ORDER_PRINT_TEAM_LINKS,
} from "@/lib/sales-orders/print-team";

describe("sales order print team", () => {
  it("parses receiving / production / cutting; unknown is full", () => {
    assert.equal(parseSalesOrderPrintTeam("receiving"), "receiving");
    assert.equal(parseSalesOrderPrintTeam("production"), "production");
    assert.equal(parseSalesOrderPrintTeam("cutting"), "cutting");
    assert.equal(parseSalesOrderPrintTeam("full"), "full");
    assert.equal(parseSalesOrderPrintTeam("nope"), "full");
    assert.equal(parseSalesOrderPrintTeam(null), "full");
  });

  it("treats production and cutting as piece-QR sheets", () => {
    assert.equal(isPieceQrPrintTeam("production"), true);
    assert.equal(isPieceQrPrintTeam("cutting"), true);
    assert.equal(isPieceQrPrintTeam("receiving"), false);
    assert.equal(isPieceQrPrintTeam("full"), false);
  });

  it("exposes a Cutting (A4) tab before Production pieces", () => {
    const ids = SALES_ORDER_PRINT_TEAM_LINKS.map((link) => link.id);
    assert.deepEqual(ids, ["receiving", "cutting", "production", "full"]);
    assert.equal(
      SALES_ORDER_PRINT_TEAM_LINKS.find((link) => link.id === "cutting")?.label,
      "Cutting (A4)"
    );
  });

  it("sales order and receiving UIs link the cutting A4 site-wide", () => {
    const actions = readFileSync("src/components/orders/SalesOrderActions.tsx", "utf8");
    assert.match(actions, /print\?team=cutting/);
    assert.match(actions, /A4 cutting list/);

    const toolbar = readFileSync("src/components/orders/SalesOrderPrintToolbar.tsx", "utf8");
    assert.match(toolbar, /SALES_ORDER_PRINT_TEAM_LINKS/);
    assert.match(toolbar, /print\?team=\$\{link\.id\}/);

    const receiving = readFileSync(
      "src/components/fabric-receiving/FabricReceivingWorkList.tsx",
      "utf8"
    );
    assert.match(receiving, /print\?team=cutting/);
    assert.match(receiving, /A4 cutting/);

    const packToolbar = readFileSync("src/components/orders/PrintPackToolbar.tsx", "utf8");
    assert.match(packToolbar, /print\?team=cutting/);
    assert.match(packToolbar, /A4 cutting list/);

    const printPage = readFileSync("src/app/(print)/orders/[id]/print/page.tsx", "utf8");
    assert.match(printPage, /parseSalesOrderPrintTeam/);
    assert.match(printPage, /Cutting - piece QRs/);
  });
});
