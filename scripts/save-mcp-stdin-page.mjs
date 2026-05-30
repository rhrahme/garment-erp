/** Save MCP page from stdin: node save-mcp-stdin-page.mjs <listId> <page> */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const pagesDir = path.join(ROOT, "src/data/.clickup-cache-build/pages");

const [listId, pageStr] = process.argv.slice(2);
const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
fs.mkdirSync(pagesDir, { recursive: true });
const out = path.join(pagesDir, `${listId}-p${pageStr}.json`);
fs.writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${out} (count=${payload.count ?? 0})`);
