/** Save filter page from stdin JSON: node save-filter-page-stdin.mjs <listId> <page> */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const pagesDir = path.join(ROOT, "src/data/.clickup-cache-build/pages");
const SUMMARIES_PATH = path.join(ROOT, "src/data/.clickup-cache-build/summaries.json");

const [listId, pageStr] = process.argv.slice(2);
const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));

fs.mkdirSync(pagesDir, { recursive: true });
const pagePath = path.join(pagesDir, `${listId}-p${pageStr}.json`);
fs.writeFileSync(pagePath, `${JSON.stringify(payload, null, 2)}\n`);

const map = fs.existsSync(SUMMARIES_PATH)
  ? JSON.parse(fs.readFileSync(SUMMARIES_PATH, "utf8"))
  : {};
for (const task of payload.tasks ?? []) {
  map[task.id] = { id: task.id, name: task.name, list: task.list };
}
fs.writeFileSync(SUMMARIES_PATH, `${JSON.stringify(map, null, 2)}\n`);
console.log(`Saved ${pagePath} (${payload.count ?? 0} tasks, ${Object.keys(map).length} summaries)`);
