/**
 * Build summaries from existing cache + saved filter page files.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CACHE_PATH = path.join(ROOT, "src/data/clickup-import-cache.json");
const STATE_DIR = path.join(ROOT, "src/data/.clickup-cache-build");
const PAGES_DIR = path.join(STATE_DIR, "pages");
const SUMMARIES_PATH = path.join(STATE_DIR, "summaries.json");

const map = {};

if (fs.existsSync(CACHE_PATH)) {
  for (const task of JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"))) {
    map[task.id] = { id: task.id, name: task.name, list: task.list };
  }
}

if (fs.existsSync(PAGES_DIR)) {
  for (const file of fs.readdirSync(PAGES_DIR).filter((f) => f.endsWith(".json"))) {
    const payload = JSON.parse(fs.readFileSync(path.join(PAGES_DIR, file), "utf8"));
    for (const task of payload.tasks ?? []) {
      map[task.id] = { id: task.id, name: task.name, list: task.list };
    }
  }
}

fs.mkdirSync(STATE_DIR, { recursive: true });
fs.writeFileSync(SUMMARIES_PATH, `${JSON.stringify(map, null, 2)}\n`);
console.log(JSON.stringify({ summaries: Object.keys(map).length }));
