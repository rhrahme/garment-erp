/**
 * Paginate ClickUp lists from saved tmp payloads and save page files.
 * Agent workflow: MCP clickup_filter_tasks -> write tmp JSON -> run save-page-from-file.
 * This script batch-saves any tmp/*-p*.json files found.
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const tmpDir = path.join(ROOT, "src/data/.clickup-cache-build/tmp");
const pagesDir = path.join(ROOT, "src/data/.clickup-cache-build/pages");

if (!fs.existsSync(tmpDir)) {
  console.log("No tmp dir");
  process.exit(0);
}

const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith(".json")).sort();
for (const file of files) {
  const m = file.match(/^(\d+)-p(\d+)\.json$/);
  if (!m) continue;
  const [, listId, page] = m;
  const pagePath = path.join(pagesDir, `${listId}-p${page}.json`);
  if (fs.existsSync(pagePath)) {
    console.log(`Skip existing ${path.basename(pagePath)}`);
    continue;
  }
  const res = spawnSync(
    process.execPath,
    ["scripts/save-page-from-file.mjs", listId, page, path.join(tmpDir, file)],
    { cwd: ROOT, stdio: "inherit" }
  );
  if (res.status !== 0) process.exit(res.status ?? 1);
}

const summaries = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src/data/.clickup-cache-build/summaries.json"), "utf8")
);
console.log(`Pages: ${fs.readdirSync(pagesDir).length}, summaries: ${Object.keys(summaries).length}`);
