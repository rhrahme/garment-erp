/**
 * Paginate ClickUp list tasks via REST (needs CLICKUP_API_TOKEN) OR read existing pages dir.
 * Writes pages to src/data/.clickup-cache-build/pages/ and merges summaries.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const pagesDir = path.join(ROOT, "src/data/.clickup-cache-build/pages");

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

async function fetchListPages(token, listId) {
  const pages = [];
  let page = 0;
  while (true) {
    const params = new URLSearchParams({
      archived: "false",
      include_closed: "false",
      subtasks: "true",
      page: String(page),
    });
    const data = await clickUpGet(token, `/list/${listId}/task?${params}`);
    const payload = {
      tasks: (data.tasks ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        list: t.list ? { id: String(t.list.id), name: t.list.name ?? "" } : undefined,
      })),
      count: data.tasks?.length ?? 0,
    };
    pages.push({ listId, page, payload });
    if (!data.tasks?.length) break;
    page += 1;
    await new Promise((r) => setTimeout(r, 120));
  }
  return pages;
}

async function main() {
  loadEnvLocal();
  const token = process.env.CLICKUP_API_TOKEN?.trim();
  if (!token) {
    console.error("No CLICKUP_API_TOKEN — use MCP filter pages in pages/ then merge-clickup-filter-pages.mjs");
    process.exit(1);
  }

  fs.mkdirSync(pagesDir, { recursive: true });
  const all = [];
  for (const listId of LIST_IDS) {
    console.log(`List ${listId}…`);
    const pages = await fetchListPages(token, listId);
    for (const { page, payload } of pages) {
      const out = path.join(pagesDir, `${listId}-p${page}.json`);
      fs.writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
      console.log(`  ${out} (${payload.count})`);
    }
    all.push(...pages);
  }

  const merge = spawnSync(
    "node",
    ["scripts/merge-clickup-filter-pages.mjs", ...all.map(({ listId, page }) => path.join(pagesDir, `${listId}-p${page}.json`))],
    { cwd: ROOT, stdio: "inherit" }
  );
  if (merge.status !== 0) process.exit(merge.status ?? 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
