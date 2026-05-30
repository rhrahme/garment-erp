/**
 * Merge filter_tasks pages from pages/*.json into summaries.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const pagesDir = path.join(ROOT, "src/data/.clickup-cache-build/pages");
const SUMMARIES_PATH = path.join(ROOT, "src/data/.clickup-cache-build/summaries.json");

const map = fs.existsSync(SUMMARIES_PATH)
  ? JSON.parse(fs.readFileSync(SUMMARIES_PATH, "utf8"))
  : {};

if (!fs.existsSync(pagesDir)) {
  console.log("No pages dir");
  process.exit(0);
}

for (const file of fs.readdirSync(pagesDir).filter((f) => f.endsWith(".json"))) {
  const payload = JSON.parse(fs.readFileSync(path.join(pagesDir, file), "utf8"));
  for (const task of payload.tasks ?? []) {
    map[task.id] = { id: task.id, name: task.name, list: task.list };
  }
}

fs.writeFileSync(SUMMARIES_PATH, `${JSON.stringify(map, null, 2)}\n`);
console.log(`Summaries: ${Object.keys(map).length}`);
