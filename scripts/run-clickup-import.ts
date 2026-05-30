/**
 * Fetch ClickUp tasks and import into ERP JSON stores.
 *
 * Usage:
 *   CLICKUP_API_TOKEN=pk_... node --experimental-strip-types scripts/run-clickup-import.ts
 *   node --experimental-strip-types scripts/run-clickup-import.ts --from-cache
 *
 * Token: https://app.clickup.com/settings/apps → API Token
 */
import fs from "fs";
import path from "path";
import { applyClickUpImport } from "../src/lib/integrations/clickup/import-orders.ts";
import { CLICKUP_IMPORT_LIST_IDS, fetchClickUpTasks } from "../src/lib/integrations/clickup/fetch-tasks.ts";

const CACHE_PATH = path.join(process.cwd(), "src/data/clickup-import-cache.json");

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  loadEnvLocal();
  const fromCache = process.argv.includes("--from-cache");
  const token = process.env.CLICKUP_API_TOKEN?.trim();

  let tasks;
  if (fromCache) {
    if (!fs.existsSync(CACHE_PATH)) {
      console.error(`Cache not found: ${CACHE_PATH}`);
      process.exit(1);
    }
    tasks = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
    console.log(`Loaded ${tasks.length} tasks from cache`);
  } else {
    if (!token) {
      console.error(
        "Missing CLICKUP_API_TOKEN. Add it to .env.local or export it.\n" +
          "Get one at https://app.clickup.com/settings/apps"
      );
      process.exit(1);
    }
    console.log(`Fetching tasks from ${CLICKUP_IMPORT_LIST_IDS.length} ClickUp lists…`);
    tasks = await fetchClickUpTasks({ apiToken: token });
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    fs.writeFileSync(CACHE_PATH, `${JSON.stringify(tasks, null, 2)}\n`, "utf8");
    console.log(`Cached ${tasks.length} tasks → ${CACHE_PATH}`);
  }

  console.log("Importing (resetting test data)…");
  const result = applyClickUpImport(tasks, { reset: true });

  console.log("\nImport complete:");
  console.log(`  Clients:              ${result.clients}`);
  console.log(`  Sales orders:         ${result.sales_orders}`);
  console.log(`  Production work orders: ${result.production_work_orders}`);
  console.log(`  Skipped parent tasks: ${result.skipped_tasks}`);
  if (result.warnings.length) {
    console.log("\nWarnings:");
    for (const warning of result.warnings) console.log(`  - ${warning}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
