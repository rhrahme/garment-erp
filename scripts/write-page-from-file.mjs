/** Write filter page from JSON file: node write-page-from-file.mjs <listId> <page> <jsonFile> */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const pagesDir = path.join(ROOT, "src/data/.clickup-cache-build/pages");

const [listId, pageStr, jsonFile] = process.argv.slice(2);
const payload = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
fs.mkdirSync(pagesDir, { recursive: true });
const out = path.join(pagesDir, `${listId}-p${pageStr}.json`);
fs.writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${out} (count=${payload.count ?? 0})`);
