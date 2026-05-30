/** Save pages from batch JSON: [{ listId, page, payload: {tasks,count} }] */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const pagesDir = path.join(ROOT, "src/data/.clickup-cache-build/pages");
const batchPath = process.argv[2];
if (!batchPath) {
  console.error("Usage: save-pages-from-batch.mjs <batch.json>");
  process.exit(1);
}
const pages = JSON.parse(fs.readFileSync(batchPath, "utf8"));
fs.mkdirSync(pagesDir, { recursive: true });
for (const { listId, page, payload } of pages) {
  const out = path.join(pagesDir, `${listId}-p${page}.json`);
  fs.writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${path.basename(out)} (count=${payload.count ?? 0})`);
}
