/** Copy all _staging/*.json to pages/ with pretty formatting */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const stagingDir = path.join(ROOT, "src/data/.clickup-cache-build/_staging");
const pagesDir = path.join(ROOT, "src/data/.clickup-cache-build/pages");

fs.mkdirSync(pagesDir, { recursive: true });
if (!fs.existsSync(stagingDir)) {
  console.error("No staging dir");
  process.exit(1);
}

let n = 0;
for (const file of fs.readdirSync(stagingDir).filter((f) => f.endsWith(".json"))) {
  const payload = JSON.parse(fs.readFileSync(path.join(stagingDir, file), "utf8"));
  const out = path.join(pagesDir, file);
  fs.writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${out} (count=${payload.count ?? 0})`);
  n++;
}
console.log(`Total: ${n}`);
