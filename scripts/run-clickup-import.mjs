/**
 * Fetch ClickUp tasks and import into ERP JSON stores.
 * Pure JS runner — no tsx required.
 *
 * Usage:
 *   node scripts/run-clickup-import.mjs
 *   node scripts/run-clickup-import.mjs --from-cache
 *
 * Requires CLICKUP_API_TOKEN in .env.local (https://app.clickup.com/settings/apps)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CACHE_PATH = path.join(ROOT, "src/data/clickup-import-cache.json");

const LIST_IDS = [
  "901807297440",
  "901807298385",
  "901807298573",
  "901815750932",
  "901815679914",
  "901815680060",
  "901815680139",
  "901815680166",
  "901807229914",
  "901807299090",
  "901807299101",
  "901807299121",
  "901807299107",
];

function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
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

async function clickUpGet(token, apiPath) {
  const res = await fetch(`https://api.clickup.com/api/v2${apiPath}`, {
    headers: { Authorization: token, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ClickUp API ${apiPath} failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function fetchListTasks(token, listId) {
  const tasks = [];
  let page = 0;
  while (true) {
    const params = new URLSearchParams({
      archived: "false",
      include_closed: "true",
      subtasks: "true",
      page: String(page),
    });
    const data = await clickUpGet(token, `/list/${listId}/task?${params}`);
    if (!data.tasks?.length) break;
    tasks.push(...data.tasks);
    page += 1;
  }
  return tasks;
}

async function fetchAllTasks(token) {
  const byId = new Map();
  for (const listId of LIST_IDS) {
    console.log(`Fetching list ${listId}…`);
    const tasks = await fetchListTasks(token, listId);
    for (const task of tasks) {
      byId.set(task.id, task);
      for (const subtask of task.subtasks ?? []) {
        byId.set(subtask.id, subtask);
      }
    }
  }

  let pending = collectMissingParentIds([...byId.values()], byId);
  let fetched = 0;
  while (pending.length > 0) {
    const batch = pending.splice(0, 25);
    for (const parentId of batch) {
      if (byId.has(parentId)) continue;
      try {
        const params = new URLSearchParams({ include_subtasks: "true" });
        const parent = await clickUpGet(token, `/task/${parentId}?${params}`);
        byId.set(parent.id, parent);
        for (const subtask of parent.subtasks ?? []) {
          byId.set(subtask.id, subtask);
        }
        fetched += 1;
      } catch (error) {
        console.warn(`Could not fetch parent ${parentId}:`, error.message);
      }
    }
    pending = collectMissingParentIds([...byId.values()], byId);
  }
  if (fetched > 0) console.log(`Fetched ${fetched} parent task(s)`);
  return [...byId.values()];
}

function collectMissingParentIds(tasks, byId) {
  const missing = new Set();
  for (const task of tasks) {
    for (const parentId of [task.parent, task.top_level_parent]) {
      if (parentId && !byId.has(String(parentId))) missing.add(String(parentId));
    }
  }
  return [...missing];
}

async function loadImportModule() {
  const { register } = await import("node:module");
  register("./clickup-import-loader.mjs", import.meta.url);

  const importUrl = pathToFileURL(path.join(ROOT, "src/lib/integrations/clickup/import-orders.ts")).href;
  return import(importUrl);
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
        "Missing CLICKUP_API_TOKEN. Add it to .env.local or run with --from-cache.\n" +
          "Get one at https://app.clickup.com/settings/apps"
      );
      process.exit(1);
    }
    console.log(`Fetching tasks from ${LIST_IDS.length} ClickUp lists…`);
    tasks = await fetchAllTasks(token);
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    fs.writeFileSync(CACHE_PATH, `${JSON.stringify(tasks, null, 2)}\n`, "utf8");
    console.log(`Cached ${tasks.length} tasks → ${CACHE_PATH}`);
  }

  console.log("Importing (resetting test data)…");
  const { applyClickUpImport } = await loadImportModule();
  const result = applyClickUpImport(tasks, { reset: true });

  console.log("\nImport complete:");
  console.log(`  Clients:                ${result.clients}`);
  console.log(`  Sales orders:           ${result.sales_orders}`);
  console.log(`  Production work orders: ${result.production_work_orders}`);
  console.log(`  Skipped:                ${result.skipped_tasks}`);
  if (result.warnings.length) {
    console.log("\nWarnings:");
    for (const warning of result.warnings) console.log(`  - ${warning}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
