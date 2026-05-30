/** Batch save filter page payloads: node batch-save-filter-pages.mjs < manifest.json */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error("Usage: batch-save-filter-pages.mjs <manifest.json>");
  process.exit(1);
}

const entries = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
for (const { listId, page, payloadFile } of entries) {
  const script = path.join(__dirname, "save-page-from-file.mjs");
  const res = spawnSync(process.execPath, [script, listId, String(page), payloadFile], {
    cwd: ROOT,
    stdio: "inherit",
  });
  if (res.status !== 0) process.exit(res.status ?? 1);
}
console.log(`Saved ${entries.length} pages`);
