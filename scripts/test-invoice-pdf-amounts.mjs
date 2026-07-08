import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/tsconfig-paths-loader.mjs", pathToFileURL("./"));

await import("../src/lib/invoicing/format-amount.test.ts");
