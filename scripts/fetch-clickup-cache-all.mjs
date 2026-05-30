/**
 * Paginate ClickUp lists via REST API, fetch detailed tasks + parents, write normalized cache.
 * Requires CLICKUP_API_TOKEN in .env.local
 *
 * Usage: node scripts/fetch-clickup-cache-all.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { normalizeTask } from "./build-clickup-import-cache.mjs";

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
      include_closed: "false",
      subtasks: "true",
      page: String(page),
    });
    const data = await clickUpGet(token, `/list/${listId}/task?${params}`);
    if (!data.tasks?.length) break;
    tasks.push(...data.tasks);
    page += 1;
    await new Promise((r) => setTimeout(r, 120));
  }
  return tasks;
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

async function main() {
  loadEnvLocal();
  const token = process.env.CLICKUP_API_TOKEN?.trim();
  if (!token) {
    console.error("Missing CLICKUP_API_TOKEN in .env.local");
    process.exit(1);
  }

  const byId = new Map();
  const listMeta = new Map();

  for (const listId of LIST_IDS) {
    console.log(`Fetching list ${listId}…`);
    const tasks = await fetchListTasks(token, listId);
    for (const task of tasks) {
      byId.set(task.id, task);
      listMeta.set(task.id, task.list);
    }
    console.log(`  ${tasks.length} tasks`);
  }

  let pending = collectMissingParentIds([...byId.values()], byId);
  while (pending.length) {
    const batch = pending.splice(0, 25);
    for (const parentId of batch) {
      if (byId.has(parentId)) continue;
      try {
        const parent = await clickUpGet(token, `/task/${parentId}?include_subtasks=false`);
        byId.set(parent.id, parent);
        await new Promise((r) => setTimeout(r, 120));
      } catch (error) {
        console.warn(`Could not fetch parent ${parentId}:`, error.message);
      }
    }
    pending = collectMissingParentIds([...byId.values()], byId);
  }

  const normalized = [...byId.values()]
    .map((task) => normalizeTask(task, listMeta.get(task.id) ?? task.list))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  console.log(`Wrote ${normalized.length} tasks → ${CACHE_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
