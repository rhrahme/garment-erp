/** Save one filter_tasks page: node scripts/save-filter-page.mjs LISTID PAGE < page.json */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = path.join(__dirname, "../src/data/.clickup-cache-build/pages");
const [listId, page] = process.argv.slice(2);
if (!listId || page === undefined) {
  console.error("Usage: save-filter-page.mjs LISTID PAGE < page.json");
  process.exit(1);
}

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
fs.mkdirSync(pagesDir, { recursive: true });
const file = path.join(pagesDir, `${listId}_p${page}.json`);
fs.writeFileSync(file, `${JSON.stringify(payload)}\n`);
console.log(`Saved ${file} (${payload.tasks?.length ?? 0} tasks)`);
