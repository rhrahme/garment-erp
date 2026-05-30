/** Copy incoming/*.json to pages/ with pretty formatting */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const incomingDir = path.join(ROOT, "src/data/.clickup-cache-build/incoming");
const pagesDir = path.join(ROOT, "src/data/.clickup-cache-build/pages");

if (!fs.existsSync(incomingDir)) {
  console.error("No incoming dir");
  process.exit(1);
}

fs.mkdirSync(pagesDir, { recursive: true });
const written = [];
for (const file of fs.readdirSync(incomingDir).filter((f) => f.endsWith(".json")).sort()) {
  const payload = JSON.parse(fs.readFileSync(path.join(incomingDir, file), "utf8"));
  const out = path.join(pagesDir, file);
  fs.writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
  written.push({ file, count: payload.count ?? 0 });
  console.log(`Wrote ${out} (count=${payload.count ?? 0})`);
}
console.log(JSON.stringify({ written, total: written.length }, null, 2));
