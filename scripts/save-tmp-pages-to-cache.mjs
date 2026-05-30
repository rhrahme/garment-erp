/** Copy tmp/{listId}-p{page}.json into pages/ if missing. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const tmpDir = path.join(ROOT, "src/data/.clickup-cache-build/tmp");
const pagesDir = path.join(ROOT, "src/data/.clickup-cache-build/pages");

if (!fs.existsSync(tmpDir)) {
  console.error("No tmp dir");
  process.exit(1);
}

const written = [];
for (const file of fs.readdirSync(tmpDir).filter((f) => f.endsWith(".json")).sort()) {
  const m = file.match(/^(\d+)-p(\d+)\.json$/);
  if (!m) continue;
  const [, listId, page] = m;
  const src = path.join(tmpDir, file);
  const dest = path.join(pagesDir, `${listId}-p${page}.json`);
  if (fs.existsSync(dest)) {
    console.log(`Skip existing ${path.basename(dest)}`);
    continue;
  }
  const payload = JSON.parse(fs.readFileSync(src, "utf8"));
  fs.mkdirSync(pagesDir, { recursive: true });
  fs.writeFileSync(dest, `${JSON.stringify(payload, null, 2)}\n`);
  written.push(path.basename(dest));
  console.log(`Wrote ${path.basename(dest)} (count=${payload.count ?? 0})`);
}
console.log(JSON.stringify({ written }, null, 2));
