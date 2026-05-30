/** Write one filter_tasks page to _staging: node write-staging-from-stdin.mjs LISTID PAGE < payload.json */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stagingDir = path.join(__dirname, "../src/data/.clickup-cache-build/_staging");
const [listId, page] = process.argv.slice(2);
if (!listId || page === undefined) {
  console.error("Usage: write-staging-from-stdin.mjs LISTID PAGE < payload.json");
  process.exit(1);
}

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
fs.mkdirSync(stagingDir, { recursive: true });
const file = path.join(stagingDir, `${listId}-p${page}.json`);
fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${path.basename(file)} (count=${payload.count ?? 0})`);
