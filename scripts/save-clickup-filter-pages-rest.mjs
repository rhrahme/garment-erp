/**
 * Fetch ClickUp list tasks via REST and save MCP-format pages { tasks, count }.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PAGES_DIR = path.join(ROOT, "src/data/.clickup-cache-build/pages");

const LIST_IDS = [
  "901807297440","901807298385","901807298573","901815750932",
  "901815679914","901815680060","901815680139","901815680166",
  "901807229914","901807299090","901807299101","901807299121","901807299107",
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
  if (!res.ok) throw new Error(`ClickUp ${apiPath} (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

function toMcpTask(task) {
  return {
    id: String(task.id),
    custom_id: task.custom_id ?? null,
    name: task.name,
    status: task.status?.status ?? task.status,
    url: task.url,
    priority: task.priority?.priority ?? task.priority ?? null,
    assignees: (task.assignees ?? []).map((a) => ({ id: a.id, username: a.username ?? a.email ?? null })),
    tags: (task.tags ?? []).map((t) => ({ name: t.name ?? t.tag ?? String(t) })),
    due_date: task.due_date ?? null,
    list: task.list ? { id: String(task.list.id), name: task.list.name ?? "" } : undefined,
  };
}

async function fetchAndSaveListPages(token, listId) {
  const written = [];
  let page = 0;
  while (true) {
    const params = new URLSearchParams({ archived: "false", include_closed: "false", subtasks: "true", page: String(page) });
    const data = await clickUpGet(token, `/list/${listId}/task?${params}`);
    const tasks = (data.tasks ?? []).map(toMcpTask);
    const payload = { tasks, count: tasks.length };
    fs.mkdirSync(PAGES_DIR, { recursive: true });
    const filename = `${listId}-p${page}.json`;
    fs.writeFileSync(path.join(PAGES_DIR, filename), `${JSON.stringify(payload, null, 2)}\n`);
    written.push({ filename, count: payload.count });
    if (payload.count === 0) break;
    page += 1;
    await new Promise((r) => setTimeout(r, 120));
  }
  return written;
}

async function main() {
  loadEnvLocal();
  const token = process.env.CLICKUP_API_TOKEN?.trim();
  if (!token) { console.error("Missing CLICKUP_API_TOKEN"); process.exit(1); }
  const allWritten = [];
  const failures = [];
  for (const listId of LIST_IDS) {
    try {
      const pages = await fetchAndSaveListPages(token, listId);
      allWritten.push(...pages.map((p) => p.filename));
      console.log(`${listId}: ${pages.length} pages`);
    } catch (e) {
      failures.push({ listId, error: e instanceof Error ? e.message : String(e) });
    }
  }
  console.log(JSON.stringify({ page_files: allWritten.length, filenames: allWritten, failures }, null, 2));
  if (failures.length) process.exit(1);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
