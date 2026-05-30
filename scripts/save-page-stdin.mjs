#!/usr/bin/env node
/** Save one MCP filter page: node save-page-stdin.mjs LIST PAGE  (JSON on stdin) */
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
console.log(`OK ${path.basename(out)} count=${payload.count ?? 0}`);
