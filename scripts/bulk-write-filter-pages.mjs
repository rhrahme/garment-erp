/**
 * Write filter_tasks page payloads from a manifest JSON file.
 * Manifest: [{ "listId": "...", "page": 0, "payload": { tasks, count } }, ...]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const pagesDir = path.join(ROOT, "src/data/.clickup-cache-build/pages");

const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error("Usage: bulk-write-filter-pages.mjs <manifest.json>");
  process.exit(1);
}

const entries = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
fs.mkdirSync(pagesDir, { recursive: true });
for (const { listId, page, payload } of entries) {
  const out = path.join(pagesDir, `${listId}-p${page}.json`);
  fs.writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${out} (${payload.count ?? 0} tasks)`);
}
