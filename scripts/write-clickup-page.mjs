/** Write filter_tasks page JSON: node scripts/write-clickup-page.mjs <listId> <page> < file.json */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const pagesDir = path.join(ROOT, "src/data/.clickup-cache-build/pages");

const [listId, pageStr] = process.argv.slice(2);
if (!listId || pageStr === undefined) {
  console.error("Usage: write-clickup-page.mjs <listId> <page> < payload.json");
  process.exit(1);
}

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const text = Buffer.concat(chunks).toString("utf8").trim();
if (!text) {
  console.error("Empty stdin");
  process.exit(1);
}

fs.mkdirSync(pagesDir, { recursive: true });
const out = path.join(pagesDir, `${listId}-p${pageStr}.json`);
fs.writeFileSync(out, `${JSON.stringify(JSON.parse(text), null, 2)}\n`);
console.log(`Wrote ${out}`);
