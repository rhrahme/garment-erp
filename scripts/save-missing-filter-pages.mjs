/**
 * Save missing filter page files from incoming/{listId}-p{page}.json to pages/.
 * Agent writes incoming files from MCP clickup_filter_tasks responses first.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const incomingDir = path.join(ROOT, "src/data/.clickup-cache-build/incoming");
const pagesDir = path.join(ROOT, "src/data/.clickup-cache-build/pages");

const MISSING = [
  ["901807298385", 0],
  ["901807298385", 1],
  ["901815680060", 0],
  ["901815680139", 0],
  ["901815750932", 0],
  ["901815750932", 1],
  ["901815680166", 0],
];

fs.mkdirSync(pagesDir, { recursive: true });
const results = [];
for (const [listId, page] of MISSING) {
  const name = `${listId}-p${page}.json`;
  const dest = path.join(pagesDir, name);
  if (fs.existsSync(dest)) {
    results.push({ name, status: "exists" });
    continue;
  }
  const src = path.join(incomingDir, name);
  if (!fs.existsSync(src)) {
    results.push({ name, status: "missing_incoming" });
    continue;
  }
  const payload = JSON.parse(fs.readFileSync(src, "utf8"));
  fs.writeFileSync(dest, `${JSON.stringify(payload, null, 2)}\n`);
  results.push({ name, status: "written", count: payload.count ?? 0 });
  console.log(`Wrote ${dest} (count=${payload.count ?? 0})`);
}

const stillMissing = results.filter((r) => r.status !== "written" && r.status !== "exists");
if (stillMissing.length) {
  console.error("Still missing:", stillMissing.map((r) => r.name).join(", "));
  process.exit(1);
}
console.log(JSON.stringify({ results, pages: fs.readdirSync(pagesDir).length }, null, 2));
