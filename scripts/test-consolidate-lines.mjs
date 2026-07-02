import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/tsconfig-paths-loader.mjs", pathToFileURL("./"));

await import("../src/lib/invoicing/consolidate-lines.test.ts");
await import("../src/lib/invoicing/display.test.ts");
await import("../src/lib/invoicing/line-reduction-suggestions.test.ts");
await import("../src/lib/sales-orders/pattern-so-mismatch.test.ts");
await import("../src/lib/sales-orders/fabric-cost.test.ts");
await import("../src/lib/fabric-sourcing/loro-piana-factory-email.test.ts");
