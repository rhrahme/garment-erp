/**
 * Ingest filter_tasks payloads (JSON array on stdin) into pages/ + summaries.
 * Usage: node scripts/ingest-mcp-filter-pages.mjs < filter-pages.json
 * filter-pages.json: [{ listId, page, tasks, count }, ...]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const pagesDir = path.join(ROOT, "src/data/.clickup-cache-build/pages");
const SUMMARIES_PATH = path.join(ROOT, "src/data/.clickup-cache-build/summaries.json");

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const entries = JSON.parse(Buffer.concat(chunks).toString("utf8"));

fs.mkdirSync(pagesDir, { recursive: true });
const map = fs.existsSync(SUMMARIES_PATH)
  ? JSON.parse(fs.readFileSync(SUMMARIES_PATH, "utf8"))
  : {};

let before = Object.keys(map).length;
for (const { listId, page, tasks, count } of entries) {
  const payload = { tasks: tasks ?? [], count: count ?? tasks?.length ?? 0 };
  const pagePath = path.join(pagesDir, `${listId}-p${page}.json`);
  fs.writeFileSync(pagePath, `${JSON.stringify(payload, null, 2)}\n`);
  for (const task of payload.tasks) {
    map[task.id] = { id: task.id, name: task.name, list: task.list };
  }
}
fs.writeFileSync(SUMMARIES_PATH, `${JSON.stringify(map, null, 2)}\n`);
console.log(
  JSON.stringify({
    pages_written: entries.length,
    summaries: Object.keys(map).length,
    added: Object.keys(map).length - before,
  })
);
