import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/tsconfig-paths-loader.mjs", pathToFileURL("./"));

await import("../src/lib/invoicing/consolidate-lines.test.ts");
await import("../src/lib/invoicing/combine-invoices.test.ts");
await import("../src/lib/invoicing/invoice-dates.test.ts");
await import("../src/lib/invoicing/named-client-invoice.test.ts");
await import("../src/lib/invoicing/client-invoice-work.test.ts");
await import("../src/lib/invoicing/invoice-client-match.test.ts");
await import("../src/lib/invoicing/display.test.ts");
await import("../src/lib/invoicing/line-reduction-suggestions.test.ts");
await import("../src/lib/costing/cost-hint-worksheet.test.ts");
await import("../src/lib/sales-orders/pattern-so-mismatch.test.ts");
await import("../src/lib/sales-orders/fabric-cost.test.ts");
await import("../src/lib/fabric-sourcing/loro-piana-factory-email.test.ts");
await import("../src/lib/fabric-sourcing/supplier-email-queue.test.ts");
