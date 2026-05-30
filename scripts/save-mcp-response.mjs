/** Save MCP filter_tasks JSON file to pages dir: node save-mcp-response.mjs <listId> <page> <response.json> */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const pagesDir = path.join(ROOT, "src/data/.clickup-cache-build/pages");

const [listId, pageStr, src] = process.argv.slice(2);
const payload = JSON.parse(fs.readFileSync(src, "utf8"));
fs.mkdirSync(pagesDir, { recursive: true });
const out = path.join(pagesDir, `${listId}-p${pageStr}.json`);
fs.writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${out} (count=${payload.count ?? 0})`);
