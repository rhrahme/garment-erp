/**
 * Seed summaries.json from existing detailed/*.json (id, name, list).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const STATE_DIR = path.join(ROOT, "src/data/.clickup-cache-build");
const DETAILED_DIR = path.join(STATE_DIR, "detailed");
const SUMMARIES_PATH = path.join(STATE_DIR, "summaries.json");

const map = fs.existsSync(SUMMARIES_PATH)
  ? JSON.parse(fs.readFileSync(SUMMARIES_PATH, "utf8"))
  : {};

for (const file of fs.readdirSync(DETAILED_DIR)) {
  if (!file.endsWith(".json")) continue;
  const task = JSON.parse(fs.readFileSync(path.join(DETAILED_DIR, file), "utf8"));
  map[task.id] = {
    id: task.id,
    name: task.name,
    list: task.list,
  };
}

fs.mkdirSync(STATE_DIR, { recursive: true });
fs.writeFileSync(SUMMARIES_PATH, `${JSON.stringify(map, null, 2)}\n`);
console.log(`Summaries: ${Object.keys(map).length}`);
